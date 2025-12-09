# Emotion Map Archive - Electron Build Instructions

This project is now configured as an Electron desktop application that can be built for macOS and Windows.

## Prerequisites

- Node.js (version 16 or higher)
- npm (comes with Node.js)

## Installation

First, install the dependencies:

```bash
npm install
```

## Development Mode

To run the app in development mode (for testing):

```bash
npm start
```

This will open the Electron application window with your Three.js visualization.

## Building Distributables

### Build for Both Platforms

To build for both macOS and Windows:

```bash
npm run build
```

### Build for macOS Only

```bash
npm run build:mac
```

This creates:
- `.dmg` installer for macOS (Intel and Apple Silicon)
- Located in `release/` folder

### Build for Windows Only

```bash
npm run build:win
```

This creates:
- `.exe` installer for Windows (64-bit)
- Located in `release/` folder

## Output Location

All built applications will be in the `release/` folder after building.

## Platform-Specific Notes

### macOS
- The build will create a universal binary that works on both Intel and Apple Silicon Macs
- You may need to allow the app in System Preferences > Security & Privacy when first running
- The build creates a `.dmg` disk image file for distribution

### Windows
- The build creates an NSIS installer (`.exe`)
- Windows Defender may show a warning on first run (common for unsigned apps)

## Customization

### App Icon
To add custom icons:
- Place `icon.icns` (macOS) in `dist/assets/`
- Place `icon.ico` (Windows) in `dist/assets/`
- The icon should be at least 512x512px

### Window Size
Edit `main.js` and change the `width` and `height` values in the `createWindow()` function.

### App Information
Edit `package.json` to change:
- `name`: App package name
- `productName`: Display name in build config
- `version`: App version
- `author`: Your name
- `description`: App description

## Troubleshooting

### App won't start
- Check that all files in `dist/` folder are present
- Verify Node.js version is 16 or higher

### Build fails
- Ensure you have enough disk space (builds can be large)
- On macOS, you may need Xcode Command Line Tools
- On Windows, you may need Windows Build Tools

### Videos or assets not loading
- Verify all assets are in the `dist/` folder
- Check that paths in HTML are relative (`./assets/` not `/assets/`)

## File Structure

```
emotion-map-archive-DISTRIBUTABLE/
├── dist/                    # Your web app files
│   ├── index.html          # Main HTML file
│   ├── assets/             # JavaScript and other assets
│   └── videos/             # Video files
├── main.js                 # Electron main process
├── package.json            # Project configuration
└── release/                # Built applications (created after build)
```
