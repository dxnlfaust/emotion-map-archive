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


// State management
let isZooming = false;
let animationPaused = false;
let rotationPaused = true;
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


// Mouse/touch tracking
let mouseDownPos = null;
let touchStartPos = null;
const dragThreshold = 5; // pixels
let zoomStart = null;


// New hover system
let hoveredCluster = null;
let hoverLines = [];
let hoverThumbnails = [];
let glowPoints = [];
let hoverLineData = []; // Store line data for animation

init();
animate();


function init() {
  setupScene();
  setupRenderer();
  setupSpheres();
  setupEventListeners();
}


function setupScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 4);
  defaultCameraPosition = camera.position.clone();
  
  const canvas = document.getElementById('maincanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x010005);
  renderer.setPixelRatio(window.devicePixelRatio);
  
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  
  group = new THREE.Group();
  scene.add(group);
}


function setupRenderer() {
  // Setup bloom effect
  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, // strength
    0.4, // radius
    0.85 // threshold
  );
  
  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);
}


function setupSpheres() {
  const offsets = [
    new THREE.Vector3(-0.8, 0, 0),
    new THREE.Vector3(0.7, 0, 0),
    new THREE.Vector3(0, 1.0, 0),
    new THREE.Vector3(0, -0.6, 0),
    new THREE.Vector3(0, 0, 1.1),
    new THREE.Vector3(0, 0, -0.8)
  ];


  const colors = [
    new THREE.Color(0xBA3EBD),  // dark purp
    new THREE.Color(0xE4ACEB),  // light purp
    new THREE.Color(0x4251B5),  // dark blue
    new THREE.Color(0x9AA6F2),  // light blue
    new THREE.Color(0xF2B078),  // dark orange
    new THREE.Color(0xFFD47C)   // light orange
  ];


  for (let s = 0; s < SPHERE_COUNT; s++) {
    const sphere = createSphere(offsets[s], colors[s]);
    spheres.push(sphere);
    group.add(sphere.points);
  }
}


function createSphere(offset, color) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(POINTS_PER_SPHERE * 3);
  const originalPositions = new Float32Array(POINTS_PER_SPHERE * 3);
  const driftVectors = [];


  let i = 0;
  while (i < POINTS_PER_SPHERE) {
    const x = 2 * Math.random() - 1;
    const y = 2 * Math.random() - 1;
    const z = 2 * Math.random() - 1;
    
    if (x*x + y*y + z*z <= 1) {
      const idx = i * 3;
      positions[idx] = originalPositions[idx] = x + offset.x;
      positions[idx + 1] = originalPositions[idx + 1] = y + offset.y;
      positions[idx + 2] = originalPositions[idx + 2] = z + offset.z;
      driftVectors.push(randomDrift());
      i++;
    }
  }


  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const material = new THREE.PointsMaterial({
    color: color,
    size: POINT_SIZE,
    sizeAttenuation: true,
    map: createCircleTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });


  const points = new THREE.Points(geometry, material);
  
  return {
    points,
    driftVectors,
    center: offset.clone(),
    radius: 1.0,
    originalColor: color.clone(),
    material
  };
}


function setupEventListeners() {
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('click', onClick);
  window.addEventListener('mousemove', onMouseMove);
  
  // Mouse/touch tracking for drag detection
  window.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });


  window.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };
  });


  window.addEventListener('touchend', handleTouchEnd);
}


function handleTouchEnd(e) {
  if (!touchStartPos) return;
  
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartPos.x;
  const dy = touch.clientY - touchStartPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance <= dragThreshold) {
    onClick({ clientX: touch.clientX, clientY: touch.clientY });
  }
}


function onMouseMove(event) {
  if (videoOverlay || isZooming) return;


  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);


  const allPoints = getAllPointsWithMetadata();
  const intersects = raycaster.intersectObjects(spheres.map(s => s.points));
  
  if (intersects.length > 0) {
    const hitPoint = intersects[0].point;
    const cluster = findNearestCluster(hitPoint, allPoints, 10);
    
    if (!hoveredCluster || !isSameCluster(cluster, hoveredCluster)) {
      clearHoverEffects();
      hoveredCluster = cluster;
      showHoverEffects(cluster, event.clientX, event.clientY);
    }
  } else {
    clearHoverEffects();
    hoveredCluster = null;
  }
}


function getAllPointsWithMetadata() {
  const allPoints = [];
  
  spheres.forEach((sphere, sphereIndex) => {
    const positions = sphere.points.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );
      allPoints.push({
        position: point,
        sphereIndex,
        pointIndex: i,
        sphere
      });
    }
  });
  
  return allPoints;
}


function findNearestCluster(centerPoint, allPoints, count) {
  const distances = allPoints.map(point => ({
    ...point,
    distance: centerPoint.distanceToSquared(point.position)
  }));
  
  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, count);
}


function isSameCluster(cluster1, cluster2) {
  if (!cluster1 || !cluster2 || cluster1.length !== cluster2.length) return false;
  
  return cluster1.every((point, i) => 
    point.sphereIndex === cluster2[i].sphereIndex && 
    point.pointIndex === cluster2[i].pointIndex
  );
}


function showHoverEffects(cluster, mouseX, mouseY) {
  // Glow effect on points
  cluster.forEach(point => {
    const material = point.sphere.material;
    const glowIntensity = 1.5;
    material.color.copy(point.sphere.originalColor).multiplyScalar(glowIntensity);
    glowPoints.push(point);
  });


  // Create connecting lines
  createHoverLines(cluster);
  
  // Create thumbnail videos
  createHoverThumbnails(cluster, mouseX, mouseY);
}


function createHoverLines(cluster) {
  const centerPointData = cluster[0]; // This is the start point for all lines
  const centerPoint = centerPointData.position.clone();


  // Create lines from center to each other point in cluster
  cluster.slice(1).forEach(pointData => { // This is the end point
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 points * 3 coordinates


    positions[0] = centerPoint.x;
    positions[1] = centerPoint.y;
    positions[2] = centerPoint.z;
    positions[3] = pointData.position.x;
    positions[4] = pointData.position.y;
    positions[5] = pointData.position.z;


    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));


    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0, // Start with opacity 0 to fade in
      blending: THREE.AdditiveBlending
    });


    const line = new THREE.Line(geometry, material);
    scene.add(line);
    
    // --- FIX STARTS HERE ---


    // 1. Add the line to hoverLines for easy removal in clearHoverEffects
    hoverLines.push(line);


    // 2. Add a detailed object to hoverLineData for the animation loop
    hoverLineData.push({
      line: line,
      startPoint: centerPointData, // Reference to the center point's data
      endPoint: pointData,         // Reference to the connected point's data
      currentOpacity: 0,
      targetOpacity: 0.3,          // The original opacity you used
      fadeSpeed: 0.05              // Controls how fast the line fades in/out
    });
    
    // --- FIX ENDS HERE ---
  });
}


function createHoverThumbnails(cluster, mouseX, mouseY) {
  // Set how many thumbnails you want. This will create up to 3.
  const thumbnailCount = Math.min(4, cluster.length);


  // --- CHANGE IS HERE ---
  // Start the loop from i = 1 to skip the central point (cluster[0])
  // and create thumbnails for the endpoints of the lines.
  for (let i = 1; i < thumbnailCount; i++) {
    const point = cluster[i]; // This now gets the endpoint of a line
    const videoIndex = (point.pointIndex % 23) + 1;


    // Calculate screen position for this point
    const screenPos = point.position.clone().project(camera);
    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;


    // The animation delay is i-1 so it starts from 0, 1, 2...
    const thumbnail = createThumbnailElement(videoIndex, x, y, i - 1);
    hoverThumbnails.push(thumbnail);
  }
}


function createThumbnailElement(videoIndex, x, y, delay) {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = `${x}px`;
  container.style.top = `${y}px`;
  container.style.transform = 'translate(-50%, -50%) scale(0)';
  container.style.zIndex = 500;
  container.style.opacity = 0;
  container.style.transition = `all 0.3s ease ${delay * 0.1}s`;
  container.style.pointerEvents = 'none';

  const video = document.createElement('video');
  video.src = `./videos/${videoIndex}.mp4`;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  // video.autoplay = true; // We will replace this line.
  video.loop = true;
  video.style.width = '80px';
  video.style.height = '60px';
  video.style.objectFit = 'cover';
  video.style.borderRadius = '4px';
  video.style.border = '1px solid rgba(255,255,255,0.3)';

  // --- FIX STARTS HERE ---
  // Explicitly call play() for better reliability
  const playPromise = video.play();

  if (playPromise !== undefined) {
    playPromise.catch(error => {
      // Autoplay was prevented.
      // You can log this for debugging, but we'll ignore it for now
      // as muted videos should generally be allowed to play.
      console.error("Video play failed:", error);
    });
  }
  // --- FIX ENDS HERE ---

  container.appendChild(video);
  document.body.appendChild(container);

  // Animate in
  requestAnimationFrame(() => {
    container.style.opacity = 1;
    container.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  return container;
}


function clearHoverEffects() {
  // Reset point colors
  glowPoints.forEach(point => {
    point.sphere.material.color.copy(point.sphere.originalColor);
  });
  glowPoints = [];
  
  // Remove lines
  hoverLines.forEach(line => {
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  });
  hoverLines = [];
  
  // Remove thumbnails
  hoverThumbnails.forEach(thumbnail => {
    thumbnail.remove();
  });
  hoverThumbnails = [];
}


function onClick(event) {
  if (videoOverlay) return;
  
  // Check for drag
  if (mouseDownPos) {
    const dx = event.clientX - mouseDownPos.x;
    const dy = event.clientY - mouseDownPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > dragThreshold) return;
  }


  if (hoveredCluster && hoveredCluster.length > 0) {
    // Use the hovered cluster for interaction
    const centerPoint = calculateClusterCenter(hoveredCluster);
    selectedPoint = centerPoint;
    
    pauseAnimation();
    zoomToPoint(centerPoint);
    
    const mainPoint = hoveredCluster[0];
    const nearestScreenCoords = hoveredCluster.slice(1, 4).map(point => {
      const screen = point.position.clone().project(camera);
      return {
        x: (screen.x * 0.5 + 0.5) * window.innerWidth,
        y: (-screen.y * 0.5 + 0.5) * window.innerHeight
      };
    });
    
    showVideoOverlay(
      mainPoint.pointIndex,
      event.clientX,
      event.clientY,
      true,
      nearestScreenCoords,
      mainPoint.sphere.originalColor
    );
    
    clearHoverEffects();
    hoveredCluster = null;
  }
}


function calculateClusterCenter(cluster) {
  const center = new THREE.Vector3();
  cluster.forEach(point => center.add(point.position));
  center.divideScalar(cluster.length);
  return center;
}


function animate() {
  requestAnimationFrame(animate);


  // Update particle positions
  if (!animationPaused || zoomProgress < 1) {
    updateParticles();
    
    if (!rotationPaused) {
      group.rotation.y += 0.0005;
    }
  }


  // Update hover lines
  updateHoverLines();


  // Handle zoom animations
  updateZoomAnimations();
  
  // Update orbiting videos
  updateOrbitingVideos();
  
  controls.update();
  composer.render();
}


function updateHoverLines() {
  // Only process if we have line data
  if (!hoverLineData || hoverLineData.length === 0) return;
  
  // Update line positions and opacity
  for (let i = hoverLineData.length - 1; i >= 0; i--) {
    const lineData = hoverLineData[i];
    
    // Safety check
    if (!lineData || !lineData.line || !lineData.line.geometry) continue;
    
    const positions = lineData.line.geometry.attributes.position.array;
    
    // Get the actual current positions from the particle geometry
    const startPos = lineData.startPoint.sphere.points.geometry.attributes.position;
    const endPos = lineData.endPoint.sphere.points.geometry.attributes.position;
    
    // Update line endpoints to follow the drifting particles
    positions[0] = startPos.getX(lineData.startPoint.pointIndex);
    positions[1] = startPos.getY(lineData.startPoint.pointIndex);
    positions[2] = startPos.getZ(lineData.startPoint.pointIndex);
    positions[3] = endPos.getX(lineData.endPoint.pointIndex);
    positions[4] = endPos.getY(lineData.endPoint.pointIndex);
    positions[5] = endPos.getZ(lineData.endPoint.pointIndex);
    
    lineData.line.geometry.attributes.position.needsUpdate = true;
    
    // Animate opacity
    if (lineData.currentOpacity < lineData.targetOpacity) {
      lineData.currentOpacity = Math.min(lineData.currentOpacity + lineData.fadeSpeed, lineData.targetOpacity);
    } else if (lineData.currentOpacity > lineData.targetOpacity) {
      lineData.currentOpacity = Math.max(lineData.currentOpacity - lineData.fadeSpeed, lineData.targetOpacity);
    }
    
    lineData.line.material.opacity = lineData.currentOpacity;
    
    // Remove fully faded lines
    if (lineData.targetOpacity === 0 && lineData.currentOpacity === 0) {
      scene.remove(lineData.line);
      lineData.line.geometry.dispose();
      lineData.line.material.dispose();
      hoverLineData.splice(i, 1);
      const lineIndex = hoverLines.indexOf(lineData.line);
      if (lineIndex > -1) {
        hoverLines.splice(lineIndex, 1);
      }
    }
  }
}


function updateParticles() {
  spheres.forEach(({ points, driftVectors, center, radius }) => {
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


      positions[idx] = newPos.x + center.x;
      positions[idx + 1] = newPos.y + center.y;
      positions[idx + 2] = newPos.z + center.z;
    }


    points.geometry.attributes.position.needsUpdate = true;
  });
}


function updateZoomAnimations() {
  if (zoomTarget && zoomProgress < 1) {
    zoomProgress += 0.02;
    camera.position.lerpVectors(zoomStart, zoomTarget, easeOutCubic(zoomProgress));
    if (zoomProgress >= 1) {
      camera.lookAt(selectedPoint);
    }
  }


  if (returningFromZoom && returnProgress < 1) {
    returnProgress += 0.02;
    camera.position.lerpVectors(camera.position, defaultCameraPosition, easeOutCubic(returnProgress));
    if (returnProgress >= 1) {
      returningFromZoom = false;
      camera.lookAt(new THREE.Vector3(0, 0, 0));
    }
  }
}


function updateOrbitingVideos() {
  orbitingVideos.forEach((video) => {
    video.x += video.vx;
    video.y += video.vy;


    if (video.x < 0 || video.x > window.innerWidth) video.vx *= -1;
    if (video.y < 0 || video.y > window.innerHeight) video.vy *= -1;


    video.element.style.left = `${video.x}px`;
    video.element.style.top = `${video.y}px`;
  });
}


// Utility functions
function randomDrift() {
  return new THREE.Vector3(
    (Math.random() - 0.5) * DRIFT_AMOUNT,
    (Math.random() - 0.5) * DRIFT_AMOUNT,
    (Math.random() - 0.5) * DRIFT_AMOUNT
  );
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
  zoomTarget = point.clone().add(new THREE.Vector3(0.05, 0.05, 0.05));
  zoomProgress = 0;
}


function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}


function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}


// Video overlay functions (kept from original for compatibility)
function showVideoOverlay(index, x, y, resetCamera = true, originPositions = [], pointColor = new THREE.Color(1, 1, 1)) {
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


  document.body.appendChild(videoOverlay);


  // Add related smaller videos
  const relatedIndices = [index, index - 1, index + 1, index + 2];
  relatedIndices.forEach((i, idx) => {
    if (i < 0 || i === index) return;


    const smallDiv = document.createElement('div');
    const scale = 0.25 + Math.random() * 0.25;


    const startX = originPositions[idx - 1]?.x || window.innerWidth / 2;
    const startY = originPositions[idx - 1]?.y || window.innerHeight / 2;


    smallDiv.style.position = 'absolute';
    smallDiv.style.left = `${startX}px`;
    smallDiv.style.top = `${startY}px`;
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


    const velocity = {
      x: (Math.random() - 0.5) * 0.5,
      y: (Math.random() - 0.5) * 0.5
    };


    orbitingVideos.push({
      element: smallDiv,
      x: startX,
      y: startY,
      vx: velocity.x,
      vy: velocity.y
    });


    createFloatingDotWithLine(thumb, pointColor); 
  });


  setTimeout(() => {
    window.addEventListener('click', closeVideoOverlayOnce);
  }, 100);


  createFloatingDotWithLine(video, pointColor);
}


function createFloatingDotWithLine(targetVideoElement, pointColor) {
  const dot = document.createElement('div');
  dot.className = 'floating-dot';


  const scale = 0.9 + Math.random() * 8;
  dot.style.width = `${10 * scale}px`;
  dot.style.height = `${10 * scale}px`;
  dot.dataset.scale = scale;


  let x = Math.random() * window.innerWidth;
  let y = Math.random() * window.innerHeight;
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;

  const srgbColor = pointColor.clone().convertLinearToSRGB();
  const colorStr = `rgb(${Math.floor(pointColor.r * 255)}, ${Math.floor(pointColor.g * 255)}, ${Math.floor(pointColor.b * 255)})`;
  dot.style.background = `radial-gradient(circle, ${colorStr} 13%, transparent 100%)`;
  dot.style.boxShadow = `0 0 20px ${colorStr}`;


  document.body.appendChild(dot);


  requestAnimationFrame(() => {
    dot.style.transform = 'scale(1)';
  });


  let vx = (Math.random() - 0.5) * 0.5;
  let vy = (Math.random() - 0.5) * 0.5;


  const line = document.createElement('div');
  line.className = 'dot-line';
  document.body.appendChild(line);


  function animateDot() {
    x += vx;
    y += vy;


    if (x < 0 || x > window.innerWidth) vx *= -1;
    if (y < 0 || y > window.innerHeight) vy *= -1;


    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;


    const dotRect = dot.getBoundingClientRect();
    const dotX = dotRect.left + dotRect.width / 2;
    const dotY = dotRect.top + dotRect.height / 2;


    const videoRect = targetVideoElement.getBoundingClientRect();
    const videoX = videoRect.left + videoRect.width / 2;
    const videoY = videoRect.top + videoRect.height / 2;


    const dx = videoX - dotX;
    const dy = videoY - dotY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;


    line.style.width = `${length}px`;
    line.style.left = `${dotX}px`;
    line.style.top = `${dotY}px`;
    line.style.transform = `rotate(${angle}deg)`;


    requestAnimationFrame(animateDot);
  }


  animateDot();
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
  rotationPaused = true;
  controls.enabled = true;
  selectedPoint = null;
  zoomTarget = null;
  zoomProgress = 0;
  returningFromZoom = true;
  returnProgress = 0;


  secondaryOverlays.forEach(el => el.remove());
  secondaryOverlays = [];
  orbitingVideos = [];


  document.querySelectorAll('.floating-dot, .dot-line').forEach(el => {
    el.style.transition = 'transform 0.4s ease, opacity 0.3s ease';
    el.style.transform = 'scale(0)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  });
}