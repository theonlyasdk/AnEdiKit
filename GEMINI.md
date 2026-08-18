# Project Context: AnEdiKit

## Overview
AnEdiKit is a lightweight cross-platform desktop application built using Tauri with a Rust backend and a Vanilla HTML/CSS/JavaScript frontend.

## Summary
- Application Type: Desktop app (Tauri v2)
- Frontend: HTML5, CSS3, JavaScript
- Backend: Rust (`src-tauri`)
- Package Manager: npm
- Helpers: Installation and uninstallation scripts in `tools/`

## Project Structure
```text
AnEdiKit/
├── src/                  # Frontend assets
│   ├── assets/           # Static assets
│   ├── index.html        # App view
│   ├── main.js           # Frontend logic and IPC
│   └── styles.css        # Styles
├── src-tauri/            # Rust native backend
│   ├── src/              # Source files (main.rs, lib.rs)
│   ├── Cargo.toml        # Rust package configuration
│   └── tauri.conf.json   # Tauri configuration
├── tools/                # Scripts
│   ├── Installers/       # Dependency installation
│   └── Uninstallers/     # Dependency cleanup
└── package.json          # Node scripts and dependencies
```

## Setup and Commands
Prerequisites: Node.js, Rust toolchain, Microsoft C++ Build Tools, Microsoft Edge WebView2.

```powershell
npm install
npm run tauri dev
npm run tauri build
```

## Assistant and Output Instructions
- Use summaries.
- No emojis.
- No horizontal rules (no `---`).
- No unnecessary bold letters.
- Keep responses and documentation direct, clean, and concise.
- Expose backend commands via `tauri::command` in `src-tauri/src/lib.rs` and invoke from frontend via `@tauri-apps/api/core`.
