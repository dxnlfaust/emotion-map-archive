import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';


let scene, camera, renderer, controls, group;
const spheres = [];
const SPHERE_COUNT = 6;
const POINTS_PER_SPHERE = 240;
const POINT_SIZE = 0.022;
const DRIFT_AMOUNT = 0.0005;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isZooming = false;
let animationPaused = false;
let selectedPoint = null;
let defaultCameraPosition;
let videoOverlay = null;
let zoomTarget = null;
let zoomProgress = 0;
let returningFromZoom = false;
let returnProgress = 0;
let secondaryOverlays = [];
let orbitingVideos = [];
let composer;
let mouseDownPos = null;
let touchStartPos = null;
let dragThreshold = 5; // pixels
let zoomStart = null;
let rotationPaused = false;


init();
animate();

function init() {
  const canvas = document.getElementById('maincanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x010005); // background

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 4);
  defaultCameraPosition = camera.position.clone();
  window.addEventListener('click', onClick);

  // Set up bloom
  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    2, // strength
    0.01, // radius
    0 // threshold
  );
  bloomPass.resolution.set(window.innerWidth / 2, window.innerHeight / 2);


  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  controls = new OrbitControls(camera, renderer.domElement);

  group = new THREE.Group();
  scene.add(group);

  const offsets = [
    new THREE.Vector3(-0.8, 0, 0),
    new THREE.Vector3(0.7, 0, 0),
    new THREE.Vector3(0, 1.0, 0),
    new THREE.Vector3(0, -0.6, 0),
    new THREE.Vector3(0, 0, 1.1),
    new THREE.Vector3(0, 0, -0.8)
  ];

const colors = [
  new THREE.Color(0xBA3EBD), // deeper magenta-purple (was C469C8)
  new THREE.Color(0xE4ACEB), // lighter lavender (was D096E3)

  new THREE.Color(0x4251B5), // bolder indigo (was 5E6AC0)
  new THREE.Color(0x9AA6F2), // brighter periwinkle (was 7986D4)

  new THREE.Color(0xF2B078), // deeper peach-orange (was F6CCA2)
  new THREE.Color(0xFFD47C)  // brighter golden yellow (was EBB656)
];


  for (let s = 0; s < SPHERE_COUNT; s++) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(POINTS_PER_SPHERE * 3);
    const driftVectors = [];

    let i = 0;
    while (i < POINTS_PER_SPHERE) {
      const x = 2 * Math.random() - 1;
      const y = 2 * Math.random() - 1;
      const z = 2 * Math.random() - 1;
      if (x*x + y*y + z*z <= 1) {
        const idx = i * 3;
        positions[idx]     = x + offsets[s].x;
        positions[idx + 1] = y + offsets[s].y;
        positions[idx + 2] = z + offsets[s].z;
        driftVectors.push(randomDrift());
        i++;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: colors[s],
      size: POINT_SIZE,
      sizeAttenuation: true,
      map: createCircleTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });



    const points = new THREE.Points(geometry, material);
    group.add(points);

    spheres.push({
      points,
      driftVectors,
      center: offsets[s].clone(),
      radius: 1.0
    });
  }

  window.addEventListener('resize', onWindowResize);

  window.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };
  });

  window.addEventListener('touchend', (e) => {
    if (!touchStartPos) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > dragThreshold) return; // It was a drag

    // Simulate a click event at the touch location
    onClick({
      clientX: touch.clientX,
      clientY: touch.clientY
    });
  });
}

function randomDrift() {
  return new THREE.Vector3(
    (Math.random() - 0.5) * DRIFT_AMOUNT,
    (Math.random() - 0.5) * DRIFT_AMOUNT,
    (Math.random() - 0.5) * DRIFT_AMOUNT
  );
}

function animate() {
  requestAnimationFrame(animate);

  if (!animationPaused || zoomProgress < 1) {
    for (const { points, driftVectors, center, radius } of spheres) {
      const positions = points.geometry.attributes.position.array;

      for (let i = 0; i < driftVectors.length; i++) {
        const idx = i * 3;

        const px = positions[idx] - center.x;
        const py = positions[idx + 1] - center.y;
        const pz = positions[idx + 2] - center.z;

        const nx = px + driftVectors[i].x;
        const ny = py + driftVectors[i].y;
        const nz = pz + driftVectors[i].z;

        const newPos = new THREE.Vector3(nx, ny, nz);

        if (newPos.length() > radius) {
          newPos.multiplyScalar(0.98);
          driftVectors[i] = randomDrift();
        }

        positions[idx]     = newPos.x + center.x;
        positions[idx + 1] = newPos.y + center.y;
        positions[idx + 2] = newPos.z + center.z;
      }

      points.geometry.attributes.position.needsUpdate = true;
    }

  if (!rotationPaused) {
    group.rotation.y += 0.0005;
  }

  }
  if (zoomTarget && zoomProgress < 1) {
    zoomProgress += 0.02;
    camera.position.lerpVectors(zoomStart, zoomTarget, easeOutCubic(zoomProgress));
    if (zoomProgress >= 1) {
      camera.lookAt(zoomTarget);
    }
  }

  if (returningFromZoom && returnProgress < 1) {
    returnProgress += 0.02;
    camera.position.lerpVectors(camera.position, defaultCameraPosition, easeOutCubic(returnProgress));
    if (returnProgress >= 1) {
      returningFromZoom = false;
    }
  }


  controls.update();
  composer.render();


  orbitingVideos.forEach((video) => {
    video.x += video.vx;
    video.y += video.vy;

    // Bounce at screen edges
    if (video.x < 0 || video.x > window.innerWidth) video.vx *= -1;
    if (video.y < 0 || video.y > window.innerHeight) video.vy *= -1;

    video.element.style.left = `${video.x}px`;
    video.element.style.top = `${video.y}px`;
  });
}


function onClick(event) {
  // Ignore if already showing a video
  if (videoOverlay) return;

  // Check if dragged
  const dx = event.clientX - mouseDownPos.x;
  const dy = event.clientY - mouseDownPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > dragThreshold) return; // It was a drag

  // Proceed with raycasting...
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  for (let s = 0; s < spheres.length; s++) {
    const { points } = spheres[s];
    const intersects = raycaster.intersectObject(points);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      selectedPoint = intersect.point.clone();
      const bufferIndex = intersect.index;

      pauseAnimation();
      zoomToPoint(selectedPoint);
      showVideoOverlay(bufferIndex, event.clientX, event.clientY);
      break;
    }
  }
}


function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function createCircleTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function pauseAnimation() {
  controls.enabled = false;
  rotationPaused = true;
}

function zoomToPoint(point) {
  zoomStart = camera.position.clone();
  zoomTarget = point.clone().add(new THREE.Vector3(0.05, 0.05, 0.05)); // closer
  zoomProgress = 0;
}

function showVideoOverlay(index, x, y, resetCamera = true) {
  if (resetCamera) {
    pauseAnimation();
    zoomToPoint(selectedPoint);
  }

  videoOverlay = document.createElement('div');
  videoOverlay.style.position = 'absolute';
  videoOverlay.style.left = `${x}px`;
  videoOverlay.style.top = `${y}px`;
  videoOverlay.style.transform = 'translate(-50%, -50%)';
  videoOverlay.style.zIndex = 1000;
  videoOverlay.style.opacity = 0;
  videoOverlay.style.transform = 'scale(0)';
  videoOverlay.style.transition = 'transform 0.5s ease, opacity 0.3s ease';

 // main video
  const video = document.createElement('video');
  const videoNumber = (index % 23) + 1;
  video.src = `./videos/${videoNumber}.mp4`;
  video.controls = false;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.autoplay = true;
  video.loop = true;
  video.style.width = '400px';
  video.style.maxWidth = '90vw';
  videoOverlay.appendChild(video);

    video.addEventListener('loadeddata', () => {
    requestAnimationFrame(() => {
      videoOverlay.style.opacity = 1;
      videoOverlay.style.transform = 'scale(1)';
    });
  });

  // show main video overlay
  document.body.appendChild(videoOverlay);
  requestAnimationFrame(() => {
    videoOverlay.style.opacity = 1;
  });
  

  // Add related smaller videos
  const relatedIndices = [index, index - 1, index + 1, index + 2];
    relatedIndices.forEach((i, idx) => {
      if (i < 0 || i === index) return;

      const smallDiv = document.createElement('div');
      const scale = 0.25 + Math.random() * 0.25;

      smallDiv.style.position = 'absolute';
      smallDiv.style.left = '50vw';
      smallDiv.style.top = '50vh';
      smallDiv.style.zIndex = 999;
      smallDiv.style.opacity = 0;
      smallDiv.style.transform = 'scale(0)';
      smallDiv.style.transition = 'transform 0.5s ease, opacity 0.3s ease';

      const thumb = document.createElement('video');
      const videoNumber = (i % 23) + 1;
      thumb.src = `./videos/${videoNumber}.mp4`;
      thumb.controls = false;
      thumb.setAttribute('playsinline', '');
      thumb.setAttribute('muted', '');
      thumb.autoplay = true;
      thumb.loop = true;
      thumb.style.width = `${400 * scale}px`;
      thumb.style.maxWidth = `${90 * scale}vw`;

      smallDiv.appendChild(thumb);
      document.body.appendChild(smallDiv);
      secondaryOverlays.push(smallDiv);

      thumb.addEventListener('loadeddata', () => {
        requestAnimationFrame(() => {
          smallDiv.style.opacity = 1;
          smallDiv.style.transform = 'scale(1)';
        });
      });

      // Track orbit animation data
      const velocity = {
        x: (Math.random() - 0.5) * 0.5,
        y: (Math.random() - 0.5) * 0.5
      };

      const startX = Math.random() * window.innerWidth;
      const startY = Math.random() * window.innerHeight;

      smallDiv.style.left = `${startX}px`;
      smallDiv.style.top = `${startY}px`;

      orbitingVideos.push({
        element: smallDiv,
        x: startX,
        y: startY,
        vx: velocity.x,
        vy: velocity.y
      });
    });


  // Delay adding outside click listener to avoid immediate dismissal
  setTimeout(() => {
    window.addEventListener('click', closeVideoOverlayOnce);
  }, 100);
}


function closeVideoOverlayOnce(event) {
  if (videoOverlay && !videoOverlay.contains(event.target)) {
    videoOverlay.remove();
    videoOverlay = null;
    window.removeEventListener('click', closeVideoOverlayOnce);
    resumeAnimation();
  }
}



function resumeAnimation() {
  animationPaused = false;
  rotationPaused = false;
  controls.enabled = true;
  selectedPoint = null;
  zoomTarget = null;
  zoomProgress = 0;
  returningFromZoom = true;
  returnProgress = 0;

  // Clean up videos
  secondaryOverlays.forEach(el => el.remove());
  secondaryOverlays = [];
  orbitingVideos = [];
}



function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
