# Building AnEdiKit

Instructions for setting up the development environment, running AnEdiKit locally, and compiling production release artifacts.

## Prerequisites

### Required Tools
- Node.js (v20 or newer; v22+ recommended for screenshot capture tooling) and npm
- Rust toolchain (stable) with Cargo
- Windows C++ Build Tools (MSVC toolset via Visual Studio Installer)
- WiX Toolset v3 and NSIS (used for MSI and NSIS installers; release scripts verify and cache these automatically)

### External Media Binaries
AnEdiKit executes jobs using FFmpeg and yt-dlp:
- FFmpeg and ffprobe available on system PATH, or placed in the local application tools folder.
- yt-dlp available on system PATH, or installed via the application's built-in Tools Manager.

### Python Environment (Optional, for Image & AI Tools)
For on-device neural processing (background removal, upscaling, restoration):
- Python 3.10+
- Required packages: `rembg`, `onnxruntime`, `opencv-python`, `Pillow`, `numpy`, `tqdm`

## Getting Started

### 1. Clone and Install Dependencies
```bash
git clone https://github.com/theonlyasdk/AnEdiKit.git
cd AnEdiKit
npm install
```

### 2. Run in Development Mode
Launch the Tauri desktop application with hot reload for frontend assets:
```bash
npm run tauri dev
```

Alternatively, use the interactive batch launcher:
```bash
launch.bat
```

## Production Release Builds

### Build Release Artifacts
To compile the optimized Rust binary and generate Windows installers:
```bash
npm run build
```
Or:
```bash
npm run release
```

The build script compiles the release binary and generates artifacts in the `build/` directory:
- `AnEdiKit-v<version>-windows-x64-portable.exe`: Standalone portable executable
- `AnEdiKit-v<version>-windows-x64-installer.msi`: Windows MSI installer package
- `AnEdiKit-v<version>-windows-x64-setup.exe`: NSIS setup installer
- `SHA256SUMS.txt`: SHA-256 checksums for all generated release files

### Advanced Build Flags
The build script accepts flags for specific packaging options:
```bash
# Build binary only without installer bundles
node tools/Scripts/build_release.js --no-bundle

# Generate an MSIX package alongside standard bundles
node tools/Scripts/build_release.js --msix

# Clean regenerable build outputs (build/, cargo target cache)
node tools/Scripts/build_release.js --clean

# Interactive artifact configuration
node tools/Scripts/build_release.js --interactive

# Show full help and option list
node tools/Scripts/build_release.js --help
```

### Run Release Binary
To launch the compiled release executable directly:
```bash
npm run release:run
```

## Documentation Screenshots
To regenerate full-page reference screenshots across all desktop tools, mobile drawer views, and dialogs:
```bash
npm run screenshots
```
Screenshots are written to `docs/screenshots/<version>/`.
