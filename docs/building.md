# Building AnEdiKit

Instructions for setting up the development environment, running AnEdiKit locally, and compiling production release artifacts.

## Prerequisites

### Required Tools
- [Node.js](https://nodejs.org/en/download/) (v20 or newer; v22+ recommended for screenshot tooling) and [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [Rust & Cargo](https://rustup.rs/) (stable toolchain)
- [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (MSVC toolset via Visual Studio Installer)
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (Evergreen standalone installer or bootstrapper)
- [WiX Toolset v3](https://github.com/wixtoolset/wix3/releases) and [NSIS](https://nsis.sourceforge.io/Download) (used for MSI and NSIS installer packaging; release scripts verify and cache these automatically)

Windows users can automatically configure Rust, C++ Build Tools, and WebView2 by executing the project setup script:
```cmd
tools\Installers\run_installer_admin.bat
```

### External Media Binaries
AnEdiKit executes jobs using FFmpeg and yt-dlp:
- [FFmpeg & FFprobe](https://github.com/BtbN/FFmpeg-Builds/releases) (or via [ffbinaries](https://ffbinaries.com/downloads)): place on system PATH, or in the application local `tools` directory.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest): place on system PATH, or download directly via the application's built-in Tools Manager.
- [Deno](https://github.com/denoland/deno/releases/latest) (optional): used by Tools Manager for YouTube signature deciphering workflows.

### Python Environment (Optional, for Image & AI Tools)
For on-device neural processing (background removal, upscaling, restoration):
- [Python](https://www.python.org/downloads/) (version 3.10+)
- Required packages: `rembg`, `onnxruntime`, `opencv-python`, `Pillow`, `numpy`, `tqdm`

## Linux (Experimental)

> [!WARNING]
> Linux support is experimental and has not been tested yet. Native dependencies and window decorations may require platform adjustments.

### Prerequisites

#### Debian / Ubuntu
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev ffmpeg
```

#### Fedora
```bash
sudo dnf install -y webkit2gtk4.1-devel gcc-c++ make curl wget file libxdo-devel openssl-devel libayatana-appindicator-devel librsvg2-devel ffmpeg
```

#### Arch Linux
```bash
sudo pacman -Syu --needed webkit2gtk-4.1 base-devel curl wget file xdotool openssl libayatana-appindicator librsvg ffmpeg
```

Install [Node.js](https://nodejs.org/en/download/) (v20+) and [Rust](https://rustup.rs/):
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Install [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/latest):
```bash
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### Build on Linux
```bash
npm install
npm run tauri build -- --bundles deb,appimage
```

## macOS (Experimental)

> [!WARNING]
> macOS support is experimental and has not been tested yet. Window transparency effects and native menus may require adjustments.

### Prerequisites (macOS)
Install [Xcode Command Line Tools](https://developer.apple.com/xcode/resources/):
```bash
xcode-select --install
```

Install [Homebrew](https://brew.sh/) (if not already present), then install [Node.js](https://nodejs.org/en/download/), [Rust](https://rustup.rs/), and media utilities:
```bash
brew install node rust ffmpeg yt-dlp
```

### Build on macOS
```bash
npm install
npm run tauri build -- --bundles dmg,app
```

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
npm run build:release
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
