# AnEdiKit Tools Guide

Quick guide for installing dependencies and the helper tools for AnEdiKit.

## Installing dependencies

To build Tauri apps on Windows, you need:
- **Rust** (compiler and cargo package manager)
- **Microsoft Edge WebView2** (runs the app interface)
- **Visual Studio C++ Build Tools** (compiles native code)

### Steps to install
1. Open the `tools/Installers/` folder in File Explorer.
2. Double-click **`run_installer_admin.bat`**.
3. Click **Yes** on the Windows Admin prompt (UAC).

## Uninstalling dependencies

If you ever want to completely remove Rust, Cargo caches, and clear your PATH environment variables:

### Interactive Run:
```powershell
python tools/Uninstallers/uninstall_tauri_dependencies.py
```
*(The script will ask for confirmation before deleting anything.)*

### Flags (optional):
- Skipping confirmation prompt:
  ```powershell
  python tools/Uninstallers/uninstall_tauri_dependencies.py --yes
  ```
- Delete AnEdiKit folder:
  ```powershell
  python tools/Uninstallers/uninstall_tauri_dependencies.py --purge-project
  ```

## Helper tools

Run these from the project root.

- **`launch.bat`** — launcher menu: `[0]` exit, `[1]` local dev, `[2]` run release, `[3]` build release. Pass the option directly to skip the menu (e.g. `launch.bat 1`).
- **`tools/Scripts/build_release.js`** — builds the release (portable exe + installers + optional MSIX). Also via `npm run build:release`.
- **`tools/Scripts/run_release.js`** — launches the locally-built release binary. Also via `npm run release:run`.
- **`tools/Scripts/new_signing_cert.js`** — generates a self-signed code-signing cert for MSIX signing. Also via `npm run new-cert`.
- **`tools/Scripts/capture_screenshots.js`** — captures documentation screenshots of every page. Also via `npm run screenshots`.
- **`tools/Scripts/prompt.js`** — shared prompt helper used by the other scripts.
- **`tools/reset_anedikit_data.bat`** — wipes app data so the next launch feels like a fresh install.

## Running the project

Once installed, open a fresh terminal in the project root and run:
```powershell
cd AnEdiKit
launch.bat
```
Or run dev directly:
```powershell
npm run tauri dev
```