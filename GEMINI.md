# Project Context: AnEdiKit

## Overview
**AnEdiKit** is a lightweight, cross-platform desktop application built using **Tauri** (Rust backend + Vanilla HTML/CSS/JavaScript frontend).

---

## 🏗️ Tech Stack & Architecture

- **Backend**: Rust (`src-tauri/`) with Tauri v2
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (`src/`)
- **Package Manager**: npm
- **Tooling & Scripts**: Located in [`tools/`](./tools/) for environment setup and cleanup

---

## 📂 Project Structure

```text
AnEdiKit/
├── src/                  # Web frontend assets (HTML, CSS, JS)
│   ├── assets/           # Icons and static media
│   ├── index.html        # Main app view
│   ├── main.js           # Frontend logic & Tauri IPC invocations
│   └── styles.css        # App styling
├── src-tauri/            # Rust native backend
│   ├── src/              # Rust source code (main.rs, lib.rs)
│   ├── Cargo.toml        # Rust dependencies & metadata
│   └── tauri.conf.json   # Tauri app configuration & permissions
├── tools/                # Environment helper scripts
│   ├── Installers/       # Automated dependency installers
│   └── Uninstallers/     # Clean uninstallation scripts
└── package.json          # Node scripts & dependencies
```

---

## ⚙️ Development Setup & Workflow

### Prerequisites
- **Node.js** (v20+ recommended) & npm
- **Rust Toolchain** (`rustup`, `rustc`, `cargo`)
- **Microsoft C++ Build Tools** (MSVC) on Windows
- **Microsoft Edge WebView2**

### Common Commands

```powershell
# 1. Install frontend dependencies
npm install

# 2. Run in development mode (hot-reloading)
npm run tauri dev

# 3. Build production bundle
npm run tauri build
```

---

## 🤖 Assistant & Coding Guidelines

1. **Frontend**: Keep styling clean, responsive, and avoid unnecessary heavy frameworks unless requested.
2. **Backend (Rust)**: Keep Tauri commands concise and safe, leveraging Rust's type system and error handling.
3. **IPC**: Expose backend commands via `tauri::command` in `src-tauri/src/lib.rs` and invoke them in frontend using `@tauri-apps/api/core`.
4. **Git**: Keep commits clear, descriptive, and atomic.
