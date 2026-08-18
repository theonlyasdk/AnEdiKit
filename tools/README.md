# AnEdiKit Tools Guide

This folder contains helper scripts to install and uninstall the tools needed to build and run **AnEdiKit**.

---

## 📁 Folder Overview

```text
tools/
├── Installers/      # Scripts to setup Tauri & Rust dependencies
└── Uninstallers/    # Scripts to clean up and remove dependencies
```

---

## 🚀 How to Install Dependencies

To build Tauri apps on Windows, you need:
- **Rust** (compiler and cargo package manager)
- **Microsoft Edge WebView2** (runs the app interface)
- **Visual Studio C++ Build Tools** (compiles native code)

### Method 1: Double-Click (Easiest)
1. Open the `tools/Installers/` folder in File Explorer.
2. Double-click **`run_installer_admin.bat`**.
3. Click **Yes** on the Windows Admin prompt (UAC).

### Method 2: From PowerShell (Administrator)
Open PowerShell as Administrator and run:
```powershell
python tools/Installers/install_tauri_dependencies.py
```

---

## 🧹 How to Uninstall Dependencies

If you ever want to completely remove Rust, Cargo caches, and clear your PATH environment variables:

### Interactive Run:
```powershell
python tools/Uninstallers/uninstall_tauri_dependencies.py
```
*(The script will ask for confirmation before deleting anything.)*

### Optional Flags:
- **Skip confirmation prompt**:
  ```powershell
  python tools/Uninstallers/uninstall_tauri_dependencies.py --yes
  ```
- **Also delete the AnEdiKit folder**:
  ```powershell
  python tools/Uninstallers/uninstall_tauri_dependencies.py --purge-project
  ```

---

## 🛠️ Developing AnEdiKit

Once installed, open a fresh terminal in the project root and run:
```powershell
cd AnEdiKit
npm run tauri dev
```
