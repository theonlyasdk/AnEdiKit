# AnEdiKit Tools Guide

Quick guide for installing dependencies for AnEdiKit.

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

## Running the project

Once installed, open a fresh terminal in the project root and run:
```powershell
cd AnEdiKit
npm run tauri dev
```
