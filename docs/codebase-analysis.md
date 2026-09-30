# AnEdiKit — Codebase Analysis Report

> **Date:** 2026-09-20  
> **Version analyzed:** 0.5.0  
> **Overall Grade: B (75/100)**
>
> **Reassessment (2026-09-20, same day): B+ (84/100)** — all P0 items and most P1
> items below are now fixed (348 passing tests, up from 307). Sections marked
> **[FIXED]**, **[PARTIAL]**, or **[OPEN]** reflect the current tree.

---

## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. Architecture Overview](#2-architecture-overview)
- [3. Codebase Metrics](#3-codebase-metrics)
- [4. Code Quality](#4-code-quality)
- [5. Security Assessment](#5-security-assessment)
- [6. Performance Concerns](#6-performance-concerns)
- [7. Testing & Coverage](#7-testing--coverage)
- [8. Dependency Health](#8-dependency-health)
- [9. Documentation Quality](#9-documentation-quality)
- [10. Prioritized Recommendations](#10-prioritized-recommendations)

---

## 1. Executive Summary

AnEdiKit is a well-structured Tauri v2 desktop application with a vanilla JS/CSS/HTML frontend and Rust backend. The codebase is **~33,500 lines** across 4 languages with 307 passing unit tests. The architecture is modular and organized, but several systemic issues need attention:

> **[Reassessment]** Now **361 passing unit tests** (28 JS test files + 1 Python), **79 JS modules** (up from 44) with zero static import cycles in `src/js`/`src/kits`/`main`, and an esbuild release pipeline. Most P0/P1 items below are fixed. **Pilot lazy loading (P2 #12) is now staged** — `view-custom` is demand-loaded with a shimmer skeleton after switching to `assemble_html.py --lazy`; default artifact stays fully-inlined for backward compat.

| Category | Was | Now | Status |
|----------|-----|-----|--------|
| Architecture | 85/100 | 90/100 | ✅ Good — zero import cycles in `src/js`, facade splits |
| Code Quality | 70/100 | 82/100 | ✅ Good — catches fixed, XSS escaped, splits done |
| Security | 80/100 | 88/100 | ✅ Good — CSP + SRI + escaping (asset scope still `**`) |
| Performance | 70/100 | 76/100 | ⚠️ Improving — build pipeline exists, not yet wired to release |
| Testing | 75/100 | 84/100 | ✅ Good — 348 tests incl. runner/audio_tags/XSS |
| Dependencies | 85/100 | 88/100 | ✅ Good — versions synced, esbuild added |
| Documentation | 80/100 | 80/100 | ✅ Good — ADRs still missing |

**Top 3 Issues:**
1. **[PARTIAL] Event listener leaks** — audit showed most attaches are init-once/guarded/fresh-node; the 8 genuinely unguarded init sites now use idempotent `bindKeyed`. Full event delegation for dynamic lists still open.
2. **[FIXED] Silent error swallowing** — recount found 54 truly-silent catches (not 106); all now route through `errors.js:reportError` with call-site context. 2 intentional silences remain (inside the reporter itself).
3. **[FIXED] File size sprawl** — zero files over 1,000 lines in `src/js` (only `kits/builder.js` at 1,066 remains, separate subsystem). `commands.js` is a 187-line facade since the split.

---

## 2. Architecture Overview

### Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri v2 (Rust) |
| Frontend | Vanilla JS (ES modules), HTML, CSS |
| UI Framework | Bootstrap 5.3.8, Ionicons 8.1.0 |
| Backend CLI | FFmpeg, yt-dlp, Python (AI/PDF) |
| Code Editor | Monaco Editor (CDN, SRI-pinned) |
| Build | `tauri build` (dev serves `src/`); `npm run build:web` → esbuild bundle to `build/web/` |

### Module Architecture

```
src/
├── main.js              # App entry point, init orchestrator (306 lines)
├── index.html           # Generated artifact (34 partials in src/partials/, see below)
├── partials/            # [NEW] Single-file-per-view HTML sources (assembled by tools/Scripts/assemble_html.py)
├── js/                  # 79 ES modules (20,251 lines total), zero static import cycles
│   ├── commands.js      # [FACADE, was 1,833] re-exports commands/*.js (probe/path/hwaccel/video/ytdlp/filter)
│   ├── media.js         # [was 1,532, now 777] + media/*.js (artwork/metadata_ui/probe)
│   ├── audio_tags.js    # [FACADE, was 1,548] + audio_tags/*.js (queue/cover/tags/render/execute)
│   ├── tools_manager.js # [FACADE, was 1,234] + tools/*.js (store/versions/alerts/render/updates/dialogs)
│   ├── runner.js        # [FACADE, was 1,108] + runner/*.js (state/progress/job/batch/notify)
│   ├── execution.js     # [was 1,099, now 374] + execution/bindings.js (form wiring)
│   ├── escape.js        # [NEW] canonical HTML escaper; errors.js, dom_bind.js, active_tool.js, …
│   └── ... (60+ more modules, none over 1,000 lines except kits/builder.js)
├── css/                 # 13 stylesheets (3,675 lines)
│   ├── styles.css       # Barrel import file
│   ├── layout.css       # Main layout (1,190 lines) ← LARGEST
│   └── ...
├── kits/                # User kits macro engine (13 files, ~170KB)
├── py/                  # Python backends (2 files, 1,468 lines)
│   ├── image_ai_engine.py  # Neural image processing
│   └── pdf_tools.py        # PDF operations
└── vendor/              # Vendored Bootstrap, Ionicons, Bootstrap-Icons

src-tauri/src/           # Rust backend (8 files, 3,658 lines)
├── lib.rs               # Tauri app setup, command registration
├── main.rs              # Entry point (7 lines)
├── tools.rs             # Binary resolution, download manager (1,006 lines)
├── jobs.rs              # Process spawning, cancellation (1,103 lines)
├── media.rs             # FFprobe, metadata extraction
├── system.rs            # File dialogs, system utilities (732 lines)
├── models.rs            # Shared data structures
└── window.rs            # Window effects
```

### Strengths

- **Clean module boundaries** — Each JS module has a single responsibility (commands, media, runner, etc.)
- **Pure function extraction** — Core logic is extracted into testable pure modules (`path_resolve.js`, `media_types.js`, `time_format.js`)
- **State isolation** — `media_store.js` holds shared state, preventing circular imports
- **Tauri command organization** — Backend split into logical modules (jobs, tools, system, media)
- **No framework dependency** — Vanilla JS avoids framework lock-in and keeps the bundle lean
- **Zero import cycles** — verified across `src/js`, `src/kits`, and `main.js` (was: 4 mutual pairs in `kits/`); kit CRUD/orchestration decoupled via `kits/ops.js` + `anedikit:kits-changed` events

### Weaknesses

- **[FIXED] God files** — `commands.js` (187-line facade), `audio_tags.js` (165), `media.js` (777), `tools_manager.js` (159), `runner.js` (160), `execution.js` (374); logic lives in focused submodules, all import paths preserved.
- **[FIXED] Dual CSS loading** — the barrel was actually unlinked dead code; `styles.css` is now the single entry point (completed in cascade order) with one `<link>` in `index.html`.
- **[FIXED] Monolithic HTML** — `index.html` is now generated from 34 partials (`src/partials/`, 28 one-file-per-view); assembler verifies byte-identical output and `--check` guards drift (covered by `html_assembly.test.js`).
- **[FIXED] No build pipeline** — `tools/Scripts/build_web.js` (esbuild): 92 modules → −36.8% JS, −34.5% CSS, manifest + `build:check` for CI. Dev/Tauri still serve `src/`.

---

## 3. Codebase Metrics

| Metric | Was | Now |
|--------|-----|-----|
| Total lines of code | 33,533 | ~34,000 (lazy scaffolding + shimmer; splits redistribute) |
| JavaScript | 21,472 lines (64%) | 20,251 lines (shared leaves removed duplication) |
| CSS | 3,675 lines (11%) | 4,140 lines (barrel completed: +motion-tokens/drag_reorder) |
| Rust | 3,658 lines (11%) | 3,658 lines (unchanged) |
| HTML | 3,260 lines (10%) | 3,404 lines (34 partials; SRI attrs + assembly comments) |
| Python | 1,468 lines (4%) | 1,468 lines (unchanged) |
| JS modules | 44 files | 79 files |
| Kits modules | 13 files | 13 files (untouched) |
| CSS files | 13 files | 13 files |
| Rust modules | 8 files | 8 files (untouched) |
| Unit tests | 307 (all passing) | **361 (all passing)** |
| Test files | 21 unit test files | 28 unit test files |

### File Size Distribution (JS, descending)

| File | Lines | Then → Now | Density |
|------|-------|------------|---------|
| `commands/video_builders.js` | 982 | (was inside 1,833-file `commands.js`) | 🟡 Watch — cohesive builders, do not regrow |
| `navigation.js` | 827 | 1,340 → 827 (registry + anim extracted) | 🟢 OK |
| `pdf_tools.js` | 803 | unchanged | 🟢 OK |
| `execution/bindings.js` | 795 | (was inside 1,099-file `execution.js`) | 🟢 OK — wiring only |
| `media.js` | 777 | 1,532 → 777 | 🟢 OK |
| `comparison.js` | 703 | unchanged | 🟢 OK |
| `commands.js` | 187 | 1,833 → facade | 🟢 OK |
| `audio_tags.js` | 165 | 1,548 → facade | 🟢 OK |
| `tools_manager.js` | 159 | 1,234 → facade | 🟢 OK |
| `runner.js` | 160 | 1,108 → facade | 🟢 OK |
| `execution.js` | 374 | 1,099 → logic only | 🟢 OK |
| `kits/builder.js` | 1,066 | unchanged (separate subsystem) | 🟡 Only file left over 1,000 lines |

---

## 4. Code Quality

### 4.1 Error Handling — ✅ FIXED

| Metric | Was | Now |
|--------|-----|-----|
| Total `try` blocks | 185 | 186 |
| Truly-silent catches | 106 (57% claimed; recount found 54) | **2 (1%)** — both inside the reporter itself |

All 54 silent catches now route through `src/js/errors.js:reportError(file:fn, err)` (warning-level, never throws, so best-effort teardown semantics are unchanged). **Recommendation implemented as stated** (central reporter + context on every catch).

### 4.2 `innerHTML` Usage — 🟡 MODERATE RISK

| File | innerHTML assignments |
|------|---------------------|
| `pdf_tools.js` | 18 |
| `tools/` + `tools_manager.js` | 16 |
| `ytdlp_format.js` | 13 |
| `audio_tags/` + `audio_tags.js` | 8 |
| `media.js` | 8 |
| Other files | 53 |
| **Total** | **116** |

> **[Reassessment]** Counts redistributed into subdirectories after the splits. The user-data vectors among these are now escaped via `escape.js` (see above); the remainder are static markup or already-escaped data.

While this is a desktop app (lower XSS risk than web), `innerHTML` with user-controlled data (filenames, metadata) could still cause DOM injection. The app constructs HTML strings with template literals containing filenames and paths.

**Recommendation implemented:** new canonical `src/js/escape.js` leaf (strictest variant, incl. single quotes); `playlist.js` and `audio_tags/render.js` delegate to it. Fixed 6 real vectors: batch-queue names, merge-list paths, image-queue names/paths/`alt`, audio-queue cover `src`, PDF metadata rows/names/URL. `test/unit/xss.test.js` proves hostile names render inert at the DOM level. Remaining 100+ `innerHTML` sites use static markup or already-escaped data.

### 4.3 Console Logging — 🟡 CLEANUP NEEDED

**113 console statements** across 22 files (stable; `reportError` centralizes new warnings). Top offenders:

| File | Count |
|------|-------|
| `storage.js` | 28 |
| `runner.js` | 16 |
| `execution.js` | 9 |
| `window_caption.js` | 8 |

**Recommendation:** Implement a logging utility with levels (debug/info/warn/error) gated by a debug flag. Strip debug logs in release builds.

### 4.4 CSS Specificity Wars — 🟡 MODERATE

| File | `!important` count |
|------|-------------------|
| `layout.css` | 29 |
| `modals.css` | 17 |
| `components.css` | 5 |
| Other | 8 |
| **Total** | **59** |

The high `!important` count in `layout.css` is largely driven by Bootstrap utility class overrides in the sidebar collapsed state. This is a known trade-off of using Bootstrap with custom collapse behavior.

**Recommendation:** Consider using more specific selectors (e.g., `body.sidebar-collapsed .sidebar .nav-link`) instead of `!important` where possible. Document why each `!important` is necessary.

### 4.5 Code Smells

- **Stub files:** `kits.js` (3 lines) and `blocks.js` (3 lines) are re-export stubs — ✅ **Keep by design** (same facade pattern used by all recent splits; verified consumed via `src/js/kits.js` bridge)
- **[FIXED] Hardcoded paths:** `main.js` L123 `"C:\Users\User\Downloads"` was unreachable dead code (`appSettings.outputDir` always falls back to defaults) — removed. Merge-queue mock path also neutralized.
- **[FIXED] Duplicate CSS loading:** the barrel was unlinked dead code, not double-parsing; it is now the single entry point (see Weaknesses).

---

## 5. Security Assessment

### 5.1 Content Security Policy — ✅ FIXED (verify in a real window before release)

```json
// tauri.conf.json → app.security
"csp": "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data: blob:; media-src 'self' asset: http://asset.localhost blob: data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https://cdnjs.cloudflare.com https://api.github.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; object-src 'none'; frame-src 'none'; base-uri 'self'"
```

Policy covers the app's actual needs (Monaco CDN + its workers, `asset:` previews, `ipc:`, GitHub release checks; `'unsafe-inline'` required for existing inline `style=` attributes). **Recommendation implemented as stated**, extended with worker/media/font/connect directives. ⚠️ Could not be exercised in a real Tauri webview here — confirm no console violations on launch.

### 5.2 Asset Protocol Scope — 🟡 MODERATE

```json
"assetProtocol": {
  "enable": true,
  "scope": ["**"]
}
```

The wildcard scope allows the webview to access any file on the filesystem via the asset protocol. This is intentional for a media toolkit (needs to preview any file), but should be documented as a security trade-off.

### 5.3 External Script Loading — 🟡 MODERATE

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js"></script>
```

Loading Monaco Editor from a CDN means:
- Network dependency at runtime
- ~~No Subresource Integrity (SRI) hash~~ **[FIXED]** — `integrity="sha384-…"` (computed from the actual 0.45.0 payload) + `crossorigin="anonymous"` on the loader tag in `src/partials/10_head.html`
- CDN compromise could inject malicious code

**Recommendation (remaining):** Optionally vendor Monaco locally to remove the runtime network dependency entirely.

### 5.4 Process Spawning — ✅ GOOD

The Rust backend properly:
- Uses `creation_flags(0x08000000)` on Windows to hide console windows
- Tracks child PIDs for cleanup
- Supports cancellation via per-job `AtomicBool` flags
- Cleans up temp files on cancellation

### 5.5 No Hardcoded Secrets — ✅ GOOD

No API keys, passwords, or secrets found in source code. The only "secrets" are PDF operation passwords which are user-provided at runtime.

---

## 6. Performance Concerns

### 6.1 Event Listener Leaks — 🟡 PARTIAL (audited, worst sites fixed)

| Metric | Was | Now |
|--------|-----|-----|
| `addEventListener` calls | 376 | 378 |
| `removeEventListener` calls | 11 | 16 |

Full audit of all ~385 attach sites: the ratio was misleading. The bulk are init-once wiring (every big `init*` runs exactly once from `main.js`), already-guarded binds (`_m3DragBound`, `dragDropBound`, `effectsBound`, `{ once: true }`), fresh-node rendering (innerHTML rebuilds destroy old listeners), or properly-removed drag listeners. The 8 genuinely unguarded multi-call sites (`initMergeControls`, `initPlaylistControls`) now use idempotent `src/js/dom_bind.js:bindKeyed` (WeakMap + stable key — closure identity defeats naive dedup).

**Recommendation (remaining):** Full event delegation for dynamic lists (batch queue, merge list) is still open — currently each row gets its own listener on re-render. Low urgency: rows are recreated (not accumulated) on each render.

### 6.2 No Bundle Optimization — 🟡 MODERATE

The app serves raw ES modules directly to the Tauri webview:
- No minification → larger payload
- No tree-shaking → unused exports shipped
- No code splitting → all 44 modules loaded upfront

For a desktop app this is acceptable (no network latency), but it means:
- Slower cold start on lower-end machines
- No dead code elimination

**Recommendation implemented:** `esbuild` dev-dependency + `tools/Scripts/build_web.js` (`npm run build:web`, `build:check` for CI) — 92 modules → single minified tree-shaken bundle (−36.8% JS, −34.5% CSS), manifest with sizes, bundle smoke-tested. Dev/Tauri still serve `src/`; wiring the bundle into the release packaging is still open.

### 6.3 Large HTML DOM — 🟡 MODERATE

`index.html` (now generated from 34 partials) still ships every tool panel inline. The browser must parse and render all DOM nodes at startup, even for tools the user hasn't opened.

**Recommendation (still open):** Lazy-load tool panels (inject HTML on first tool selection) — the partials structure now makes this feasible: fetch `partials/views/view-<tool>.html` on demand instead of assembling everything upfront.

---

## 7. Testing & Coverage

### 7.1 Test Suite Overview — ✅ GOOD

| Metric | Was | Now |
|--------|-----|-----|
| Test framework | Node.js built-in `node:test` | unchanged |
| Total tests | 307 | **357** |
| Pass rate | 100% | 100% |
| Test files | 21 JS + 1 Python | 28 JS + 1 Python |
| Execution time | ~462ms | ~500–650ms |

The test suite is fast and comprehensive for the modules it covers. New since the audit: `pure_modules`, `decoupling`, `html_assembly`, `hygiene`, `xss`, `runner_audio`.

### 7.2 Coverage Estimation

| Module | Test File | Coverage |
|--------|-----------|----------|
| `commands.js` | `command_builders.test.js` (29KB) | ✅ Well tested |
| `media_types.js` | `submodules.test.js` | ✅ Well tested |
| `output_path.js` | `pure_helpers.test.js` | ✅ Well tested |
| `storage.js` | `storage_kits.test.js` | ✅ Tested |
| `theme.js` | `theme_io.test.js` | ✅ Tested |
| `shortcuts.js` | `shortcuts.test.js` | ✅ Tested |
| `image_commands.js` | `image_commands.test.js` | ✅ Tested |
| `ui_state.js` | `ui_state.test.js` | ✅ Tested |
| `ytdlp_format.js` | `ytdlp_format.test.js` | ✅ Tested |
| `ytdlp_url.js` | `ytdlp_url.test.js` | ✅ Tested |
| `waveform.js` | `waveform.test.js` | ✅ Tested |
| `copy_anim.js` | `copy_anim.test.js` | ✅ Tested |
| `image_ai_engine.py` | `test_image_ai_engine.py` | ✅ Tested |

### 7.3 Coverage Gaps — ⚠️

**Untested modules (0 dedicated test files):**

| Module | Lines | Risk |
|--------|-------|------|
| `runner.js` (+`runner/`) | facade 160 | ✅ Now tested — `runner_audio.test.js` (flags, log classes) + existing `runner_status.test.js` |
| `navigation.js` | 827 | 🟡 Medium — UI routing (partial: `submodules`/`shortcuts` tests) |
| `pdf_tools.js` | 803 | 🟡 Medium — format helpers tested; render paths untested |
| `comparison.js` | 703 | 🟡 Medium — modal morph tested via shortcuts tests |
| `tools_manager.js` (+`tools/`) | facade 159 | 🟡 Medium — cache paths tested; update flows untested |
| `audio_tags.js` (+`audio_tags/`) | facade 165 | ✅ Now tested — `queue_state` (CRUD/persist) + `runner_audio` (tags/cover/execute) |
| `preview_providers.js` | 579 | 🟡 Medium — still untested |
| `app_settings.js` | 389 | 🟢 Low — tested via `submodules` |
| `playback.js` | 332 | 🟢 Low — controller exercised via `shortcuts`/`trimmer` tests |
| All kits modules | ~1,700 total | 🟡 Medium — `kits_ops.test.js` covers `ops.js`/`icons.js` + barrel; render flows untested |

**Recommendation implemented** for `runner.js` and `audio_tags.js`. Remaining gaps: kits modules, `preview_providers.js`, update flows in `tools/updates.js`.

### 7.4 Rust Tests

`system.rs` includes a `#[cfg(test)]` module with `percent_decode_path` tests. No other Rust test modules found.

**Recommendation:** Add unit tests for `jobs.rs` (duration parsing, ANSI stripping) and `tools.rs` (binary path resolution).

---

## 8. Dependency Health

### 8.1 NPM Dependencies — ✅ LEAN

```json
{
  "dependencies": {
    "bootstrap": "^5.3.8",
    "ionicons": "^8.1.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "esbuild": "^0.28.2"
  }
}
```

Still lean (one dev-only addition for the release build). No dependency bloat.

### 8.2 Rust Dependencies — ✅ GOOD

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri` | 2 | Desktop framework |
| `serde` / `serde_json` | 1 | Serialization |
| `rfd` | 0.15 | File dialogs |
| `base64` | 0.22 | Image encoding |
| `window-vibrancy` | 0.5 | Window effects |
| `zip` | 2.2.0 | Tool extraction |

All versions are recent. No known CVEs.

### 8.3 Vendored Assets — 🟡 CHECK

The `src/vendor/` directory contains full copies of:
- Bootstrap CSS + JS (already in `node_modules/bootstrap`)
- Bootstrap Icons CSS + fonts
- Ionicons SVGs + ESM (already in `node_modules/ionicons`)

**Duplication concern:** Both `node_modules` and `vendor/` contain Bootstrap and Ionicons. The vendored copies are what's actually used at runtime (referenced in `index.html`).

**Recommendation implemented:** `tools/Scripts/sync_vendor.py` (`npm run vendor:check` / `vendor:sync`) encodes the ground truth — `bootstrap.min.css` is byte-synced from npm; `bootstrap.bundle.min.js` carries an intentional hand-patched modal-timing fix (hash-pinned, never overwritten); `ionicons/` is a pinned hand-picked subset snapshot; `bootstrap-icons/` has no npm source and is pinned as-is. The script documents *why* vendor copies exist (Tauri serves `src/` directly) and fails CI on unexpected drift.

### 8.4 Version Mismatch — 🔴 FIX

| File | Version |
|------|---------|
| `package.json` | 0.5.0 |
| `tauri.conf.json` | 0.5.0 |
| `Cargo.toml` (+ `Cargo.lock`) | ✅ 0.5.0 — synced |

**Recommendation implemented** (manual sync + `tools/Scripts/check_versions.py`, `npm run versions:check` — fails CI on mismatch, `--fix` rewrites Cargo files from `package.json`).

---

## 9. Documentation Quality

### 9.1 README — ✅ GOOD

The `README.md` is comprehensive with:
- Feature descriptions organized by category
- Screenshots with captions
- Links to screenshot index

### 9.2 Inline Documentation — 🟡 MODERATE

- Rust code has good doc comments on public functions and modules
- JS code has sparse JSDoc — most functions lack parameter/return documentation
- CSS has occasional section comments but no design system documentation
- `src/GEMINI.md` exists as an AI-facing architecture guide (good practice)

### 9.3 Architecture Documentation — 🟡 MISSING

No dedicated architecture docs (ADRs, design decisions, module dependency diagram).

**Recommendation:** Add a `docs/architecture.md` with module dependency graph and key design decisions.

---

## 10. Prioritized Recommendations

### P0 — Fix Now

| # | Issue | Impact | Effort | Status |
|---|-------|--------|--------|--------|
| 1 | **Enable CSP** in `tauri.conf.json` | Security: No content restrictions | Low | ✅ Done (verify in real window) |
| 2 | **Sync Cargo.toml version** to 0.5.0 | Build consistency | Trivial | ✅ Done (+`Cargo.lock`) |
| 3 | **Add SRI hash** to Monaco CDN script | Supply-chain security | Low | ✅ Done |
| 4 | **Remove hardcoded path** `C:\Users\User\Downloads` in `main.js` L123 | Portability | Low | ✅ Done (was dead code) |

### P1 — Plan This Quarter

| # | Issue | Impact | Effort | Status |
|---|-------|--------|--------|--------|
| 5 | **Fix silent catch blocks** — add logging to 106 empty catches | Debuggability | Medium | ✅ Done (`errors.js`; recount was 54) |
| 6 | **Add event delegation** for dynamic lists (batch queue, merge list) | Memory stability | Medium | 🟡 Partial (audited + `bindKeyed`; delegation open) |
| 7 | **Split `commands.js`** (1,833 lines) into per-tool command builders | Maintainability | Medium | ✅ Done (+5 more splits) |
| 8 | **Add tests for `runner.js`** and `audio_tags.js` | Reliability | Medium | ✅ Done |
| 9 | **Remove dual CSS loading** — either use barrel OR individual links | Performance | Low | ✅ Done (single barrel entry) |
| 10 | **Replace innerHTML with DOM API** where user data is interpolated | Security hardening | Medium | ✅ Done via canonical escaper + tests |

### P2 — Track for Later

| # | Issue | Impact | Effort | Status |
|---|-------|--------|--------|--------|
| 11 | Add a lightweight bundler (esbuild/vite) for production builds | Startup performance | Medium | ✅ Done (wire into release next) |
| 12 | Lazy-load tool panel HTML instead of embedding all in index.html | Memory, startup | High | 🟡 Pilot done (`view-custom`, shimmer, `--lazy`; expand to more views next) |
| 13 | Add structured logging with levels | Observability | Medium | ⬜ Open (`reportError` is warn-only) |
| 14 | Add Rust unit tests for jobs.rs and tools.rs | Backend reliability | Medium | ⬜ Open |
| 15 | Document architecture decisions (ADRs) | Onboarding | Low | ⬜ Open |
| 16 | Sync vendor/ from node_modules via build script | Maintenance | Low | ⬜ Open |
| 17 | Audit and remove stub files (kits.js, blocks.js) if unused | Cleanliness | Trivial | ✅ Keep — intentional facades, in use |

---

## Appendix: File Inventory

<details>
<summary>All source files by size (click to expand)</summary>

### JavaScript (src/js/) — 79 files, 20,251 lines (reassessed; subdirectories use `/`)

| File | Lines | Size (KB) |
|------|-------|-----------|
| commands/video_builders.js | 982 | 35.1 |
| navigation.js | 827 | 31.2 |
| pdf_tools.js | 803 | 50.8 |
| execution/bindings.js | 795 | 28.6 |
| media.js | 777 | 27.5 |
| comparison.js | 703 | 25.9 |
| image_queue.js | 688 | 26.0 |
| theme.js | 671 | 21.7 |
| audio_tags/queue.js | 583 | 17.5 |
| preview_providers.js | 579 | 17.2 |
| audio_tags/render.js | 549 | 21.0 |
| ytdlp_format.js | 518 | 18.0 |
| storage.js | 512 | 15.2 |
| estimates.js | 483 | 24.3 |
| trimmer.js | 461 | 18.0 |
| tools/updates.js | 449 | 16.3 |
| ui_state.js | 447 | 13.2 |
| app_settings.js | 389 | 15.7 |
| execution.js | 374 | 12.5 |
| media/metadata_ui.js | 362 | 14.2 |
| output_path.js | 345 | 11.9 |
| playback.js | 332 | 9.9 |
| commands/ytdlp_builders.js | 328 | 13.2 |
| anim.js | 327 | 10.8 |
| waveform.js | 316 | 11.0 |
| runner/progress.js | 303 | 10.6 |
| runner/batch.js | 284 | 10.2 |
| media/probe.js | 275 | 9.5 |
| tools/scroll.js | 268 | 8.1 |
| commands/filter_builders.js | 254 | 9.4 |
| runner/notify.js | 244 | 7.8 |
| playlist.js | 240 | 8.2 |
| shortcuts.js | 233 | 6.8 |
| image_commands.js | 232 | 8.7 |
| tool_metadata.js | 226 | 7.5 |
| format_sync.js | 221 | 10.1 |
| merge.js | 220 | 7.9 |
| drag_reorder.js | 211 | 7.9 |
| commands.js | 187 | 5.6 |
| tools/render.js | 184 | 7.8 |
| runner/job.js | 177 | 6.0 |
| audio_tags.js | 165 | 4.3 |
| runner.js | 160 | 4.5 |
| tools_manager.js | 159 | 5.3 |
| ytdlp_url.js | 158 | 6.0 |
| window_caption.js | 146 | 5.2 |
| tools/dialogs.js | 144 | 4.6 |
| execute_state.js | 142 | 4.4 |
| media/artwork.js | 142 | 4.0 |
| module_state.js | 138 | 4.5 |
| m3_switch.js | 132 | 4.4 |
| audio_tags/execute.js | 127 | 3.8 |
| commands/hwaccel.js | 126 | 4.8 |
| audio_tags/tags.js | 113 | 3.5 |
| audio_tags/cover.js | 109 | 3.4 |
| copy_anim.js | 109 | 4.3 |
| tools/versions.js | 83 | 2.6 |
| m3_slider.js | 80 | 3.3 |
| cube_motion.js | 76 | 4.2 |
| media_types.js | 58 | 1.3 |
| audio_tags/loading_ui.js | 57 | 1.3 |
| commands/probe_cache.js | 55 | 2.3 |
| path_resolve.js | 52 | 1.7 |
| commands/path_helpers.js | 51 | 2.1 |
| media_store.js | 45 | 1.4 |
| log_classify.js | 34 | 1.2 |
| file_picker.js | 33 | 1.1 |
| time_format.js | 30 | 1.1 |
| tools_ui_bridge.js | 30 | 1.1 |
| dom_bind.js | 27 | 0.9 |
| runner/state.js | 23 | 0.5 |
| active_tool.js | 17 | 0.6 |
| audio_tags/audio_ui_bridge.js | 17 | 0.6 |
| escape.js | 16 | 0.6 |
| tools/alerts.js | 16 | 0.6 |
| errors.js | 14 | 0.6 |
| blocks.js | 3 | 0.2 |
| kits.js | 3 | 0.2 |
| tools/store.js | 2 | 0.1 |

### Kits (src/kits/) — 13 files

| File | Size (KB) |
|------|-----------|
| builder.js | 51.8 |
| editor.js | 26.2 |
| modals.js | 13.0 |
| runner.js | 11.5 |
| settings.js | 11.5 |
| sidebar.js | 10.5 |
| workspace.js | 10.8 |
| templates.js | 9.0 |
| blocks.js | 14.8 |
| executor.js | 7.1 |
| index.js | 1.7 |
| state.js | 1.3 |
| storage.js | 0.6 |
| kits.css | 4.1 |

### Rust (src-tauri/src/) — 8 files, 3,658 lines

| File | Size (KB) |
|------|-----------|
| tools.rs | 40.0 |
| jobs.rs | 38.8 |
| media.rs | 33.2 |
| system.rs | 25.4 |
| lib.rs | 2.9 |
| models.rs | 2.8 |
| window.rs | 1.6 |
| main.rs | 0.2 |

### Python (src/py/) — 2 files, 1,468 lines

| File | Size (KB) |
|------|-----------|
| image_ai_engine.py | 52.1 |
| pdf_tools.py | 22.1 |

</details>
