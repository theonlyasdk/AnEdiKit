# AnEdiKit — UI/UX Design Critique

**Version reviewed:** 0.5.0  
**Date:** 2026-09-20  
**Scope:** Visual design, interaction patterns, information architecture, accessibility, responsive behaviour, motion design  
**Rating:** B− (72/100) — Competent desktop craft; significant gaps in IA, accessibility, and small-viewport experience

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Visual Design](#2-visual-design)
3. [Information Architecture & Navigation](#3-information-architecture--navigation)
4. [Interaction Design & Micro-interactions](#4-interaction-design--micro-interactions)
5. [Typography & Readability](#5-typography--readability)
6. [Form Design & Controls](#6-form-design--controls)
7. [Empty States & Onboarding](#7-empty-states--onboarding)
8. [Responsive Design & Small Viewports](#8-responsive-design--small-viewports)
9. [Accessibility](#9-accessibility)
10. [Motion & Animation](#10-motion--animation)
11. [Specialist Views](#11-specialist-views)
12. [Settings UX](#12-settings-ux)
13. [Design System Maturity](#13-design-system-maturity)
14. [Prioritised Recommendations](#14-prioritised-recommendations)

---

## 1. Executive Summary

AnEdiKit delivers a polished dark-theme desktop experience with thoughtful micro-interactions (Fluent proximity-border reveal, Material ripples, sliding active indicator). The tool workspace layout is consistent and learnable — users encounter the same Input → Batch → Output → Parameters → Estimation → Command Preview stack across 30+ tools.

However, the experience degrades in several critical areas:

| Strength | Weakness |
|----------|----------|
| Consistent tool-panel layout pattern | 32 sidebar items with no collapsibility or grouping affordance |
| Well-designed empty states with clear CTAs | Mobile layout is essentially broken — single-column dropdowns truncated to 2 characters |
| Excellent comparison modal (split/side-by-side/onion) | No skip-to-content, no `aria-current`, body `user-select: none` |
| Motion token system exists (`motion-tokens.css`) | Tokens are underutilised — most animations hardcode durations |
| Native platform integration (Mica/acrylic blur) | No formal colour or spacing token system beyond Bootstrap vars |
| Live command preview + bitrate estimation | All 30+ tool panels embedded in a single 3,400-line HTML file |

---

## 2. Visual Design

### 2.1 What Works

- **Dark theme execution.** The `#1a1a2e`-range background with Bootstrap dark variables creates a professional, cinema-grade aesthetic appropriate for a media toolkit. The acrylic/Mica window vibrancy on Windows 11 adds native integration.

- **Consistent card language.** Input cards, batch queue cards, and parameter fieldsets all share the same border-radius, background, and padding vocabulary. The `section-divider-header` pattern (fieldset-legend style label cutting across a horizontal rule) is a distinctive, readable grouping device.

- **Colour-coded primary actions.** The blue Execute/Download button vs grey Reset button is a correct primary/secondary action hierarchy. The "Mark Start" (green) vs "Mark End" (red) in the trimmer uses intuitive colour semantics.

- **Transparency grid.** The checkerboard pattern in the comparison modal and image preview correctly signals alpha-channel transparency — an expected convention for image editors.

### 2.2 What Needs Work — FIXED 2026-09-20

**[FIXED] No formal colour token system.**  
The app relied on raw Bootstrap vars. Created `src/css/design-tokens.css` with semantic layer (`--aek-surface-primary/secondary/tertiary`, `--aek-text-primary/secondary/muted`, `--aek-accent-primary/success/danger`, `--aek-border`, `--aek-canvas-bg`) that resolves to `--bs-*` by default and swaps via `[data-bs-theme="light"]` and `.aek-high-contrast` overrides. Enables theming without touching components. Imported as first token layer in `src/css/styles.css:7`.

**[FIXED] Excessive inline `style` attributes — 135 → 0 in HTML.**  
Migrated all static `style="…"` from `index.html` + 34 partials into `src/css/design-tokens.css` utilities (`.aek-text-xs/sm`, `.aek-icon-*`, `.aek-trim-track`, `.aek-log-panel`, `.aek-col-220-320` etc.) and auto-generated `src/css/inline-legacy.css` (51 `.aek-legacy-*` classes preserving exact visuals). Re-ran `tools/Scripts/assemble_html.py` → `src/index.html` now has **0** `style=""` in static HTML (remaining dynamic styles are JS-driven `element.style` for trimmer positioning/progress width, not violations). Verified via `Select-String -Pattern 'style="'`.

**[FIXED] No spacing scale.**  
Defined 4px-base scale in `design-tokens.css`: `--aek-space-1:4px` … `--aek-space-10:40px` with semantic aliases `--aek-gap-xs/sm/md/lg`, `--aek-section-gap`. Replaced ad-hoc `gap: 14px` with `.aek-gap-14` (token-backed) and harmonized `section-divider-header` rhythm. Bootstrap utilities (`p-2`, `gap-3`) now map to tokens where possible.

**[FIXED] Icon sizing inconsistency.**  
Implemented formal scale in `design-tokens.css`: `--aek-icon-xs:14px`, `--aek-icon-sm:16px`, `--aek-icon-md:20px` (sidebar nav), `--aek-icon-lg:24px` (All-Tools grid), `--aek-icon-xl:32px` (empty-state hero) plus utilities `.aek-icon-*`. Replaced inline `style="font-size: 3.5rem"` hero icon with `.aek-hero-icon` (maps to `--aek-icon-xl` with opacity token).

---

## 3. Information Architecture & Navigation

### 3.1 Sidebar Overload

The sidebar presents **32 navigation items** across 5 category sections (yt-dlp: 4, FFmpeg: 14, Image & AI: 6, PDF: 7, Settings: 1), plus the "All Tools" entry. On a standard 1080p display, the sidebar requires scrolling to see all items. On a laptop at 1366×768, roughly the bottom third is below the fold.

**Problems:**
- **No collapsible sections.** Every section is always expanded. Users working exclusively with FFmpeg tools must scroll past yt-dlp items every time, and vice versa. The sidebar-section headers have visual presence (centered text with side rules) but no interactive affordance.
- **No favourites / recents / pinning.** Power users who use 3-4 tools repeatedly must still visually scan the full list.
- **No search within sidebar.** The header search bar exists but is positioned in the content header, not associated with the sidebar. Its scope and behaviour are unclear.
- **Flat hierarchy.** All items are visually identical nav-links — there's no distinction between a simple utility (Metadata Cleaner) and a complex multi-modal tool (Trim & Cut).

### 3.2 "All Tools" Browser

The All Tools view is a well-designed card grid with icon, title, and description per tool. However:
- It duplicates the sidebar's navigation function without adding grouping, tagging, or search/filter capability
- Card descriptions are truncated at ~2 lines, losing information for tools with longer descriptions
- The grid presents **48+ cards** (including PDF sub-tools not in the sidebar), creating cognitive overload
- No indication of which tools require external binaries (FFmpeg, yt-dlp, Deno, Python)

### 3.3 Recommended Navigation Redesign

| Priority | Change |
|----------|--------|
| **P0** | Make sidebar sections collapsible (click header to toggle). Persist collapsed state in localStorage. |
| **P1** | Add a "Recent Tools" section at top (last 5 used). No configuration needed. |
| **P1** | Add keyboard shortcut hints to sidebar items (or at minimum, a Cmd/Ctrl+K command palette). |
| **P2** | Add badges for tools requiring unavailable binaries (e.g., greyed-out "yt-dlp" if binary not found). |
| **P2** | Add search/filter to the All Tools grid (already have the search input in the header — wire it up for All Tools view). |

---

## 4. Interaction Design & Micro-interactions

### 4.1 Strengths

- **Fluent proximity-border reveal.** The sidebar nav-links use a `radial-gradient` pseudo-element that follows `--mouse-x` / `--mouse-y` CSS custom properties. This is a faithful Fluent Design System implementation and adds perceived quality.

- **Sliding active indicator.** The blue pill behind the active nav-link uses a `0.28s cubic-bezier` transition that physically moves from the previous position to the new one. This spatial continuity helps users track their navigation context.

- **Dual ripple system.** Sidebar items get a Fluent-style expanding ring (`fluentRippleExpand`, 2s ease-in), while Settings rows get a Material You soft wash (`m3RippleSoft`, 600ms). Having two distinct tactile languages for two distinct UI zones is intentional and works.

- **Drag-to-scroll cards.** The horizontal card containers (e.g., External Tools in Settings) support `cursor: grab` → `cursor: grabbing` drag-to-scroll with edge gradient fades as scroll affordance. Scroll position is properly hidden (`scrollbar-width: none`).

- **Button progress fill.** The `@property --btn-progress` registered custom property enables smooth CSS-driven progress fills on action buttons during downloads/updates. This is a sophisticated technique.

### 4.2 Weaknesses

**No global loading/processing indicator pattern.**  
When a tool is executing (e.g., FFmpeg encoding), the feedback is localised to the execution panel. There's no visual change to the sidebar item, the header, or any persistent indicator that work is in progress. Users switching tools lose awareness of running jobs.

> **Recommendation:** Add a subtle pulsing dot or spinner next to the sidebar item of any currently-executing tool. Consider a global status bar or the header area showing "1 task running" with elapsed time.

**Drag-and-drop zones lack hover/active states.**  
The batch queue and image queue drop zones use dashed borders for their empty state, but the visual feedback when a file is being dragged over them is not defined in CSS. Users get no confirmation that they're targeting the correct drop zone until they release.

**No undo/redo for destructive actions.**  
"Replace Source" in Background Remover is a destructive toggle that overwrites the original file. There's no confirmation dialog specific to this action, no undo, and no visual warning beyond a small label. Similarly, Metadata Cleaner strips metadata permanently.

**Command Preview is read-only without explanation.**  
The command preview box at the bottom of each tool shows the raw `ffmpeg` or `yt-dlp` command, which is excellent for power users. However:
- There's no toggle to hide it for non-technical users
- No syntax highlighting or argument grouping
- The copy button is small and lacks a tooltip confirmation state
- Long commands overflow horizontally with `white-space: nowrap`

---

## 5. Typography & Readability

### 5.1 Font Stack

The app uses the system font stack via Bootstrap. Root `font-size: 17px`, body `font-size: 15px`. This is a reasonable base size for a desktop application.

### 5.2 Issues

**Too many font-size overrides.**  
I found at least 8 distinct `font-size` values hardcoded via inline styles:
- `0.72rem` (path labels, debug info)
- `0.78rem` (lightbox details)
- `0.85rem` (nav-link padding)
- `0.875rem` (nav-link font-size)
- `1rem` (section headers)
- `small` class (Bootstrap 0.875em)
- `fs-4` class (Bootstrap heading)
- `fw-light` on modal titles

These should be consolidated into a type scale (e.g., `--type-xs`, `--type-sm`, `--type-base`, `--type-lg`, `--type-xl`).

**Readout boxes have low contrast.**  
The live bitrate estimation bars at the bottom of each tool panel (e.g., `Target: MP4 (H.264 / AAC) • Est. Video Bitrate: ~2,600 kbps • Est. Size: ~40.5 MB`) use small text inside dark-background bars. The "Calculated from media duration" right-aligned label is particularly low-contrast against the dark bar.

**Section headers vs. fieldset legends.**  
The `section-divider-header` pattern (label with side rules) is used for both major sections (Input Media, Output File) and sub-sections (Conversion Parameters, Timestamp Parameters). No visual hierarchy distinguishes primary from secondary groups — they all look the same.

---

## 6. Form Design & Controls

### 6.1 Consistent Grid Layout

Tool panels use a `row g-3` → `col-md-4` grid for parameter dropdowns. This creates a predictable 3-column layout on desktop that scales to stacked on mobile. The pattern is consistent across all FFmpeg tools — a genuine UX win.

### 6.2 Issues

**No visual hierarchy among parameters.**  
In Convert Video, "Output Format" and "Resolution Scale" occupy identical visual weight despite Output Format being the primary decision and Resolution Scale being an advanced option. A better design would group primary parameters (format, codec) above a collapsible "Advanced" section (CRF, preset, scale).

**All dropdowns are `form-select-sm`.**  
Every dropdown uses the small variant, reducing touch target size. While appropriate for a dense desktop UI, this compounds the small-viewport problem.

**Toggle switches lack state labels.**  
The Download Video tool uses blue toggles for "Embed Subtitles", "Embed Thumbnail Cover", and "Embed Metadata & Chapters". These use Bootstrap's `form-check-input` switch style, which is colour-only (blue = on, grey = off). No text label confirms the current state. For users with colour vision deficiencies, the on/off distinction is lost.

**The "Cut Mode" dropdown in Trim & Cut is too wide for its container.**  
`Fast Stream Copy (Lossless, cuts at near…` truncates with an ellipsis inside the dropdown, hiding critical information about the trade-off between stream copy and re-encode modes.

---

## 7. Empty States & Onboarding

### 7.1 Empty States Are Well-Designed

Every tool has a purpose-built empty state with:
- A contextual icon (film strip for video, music note for audio, image icon for images)
- A bold "Drop files here or click to select" label
- A supporting subtitle listing accepted formats (e.g., "Supports MP4, MKV, WebM, MOV, AVI, MP3, WAV, FLAC")
- A blue "Select Files" CTA button
- A dashed border container

This is a strong pattern. The empty state communicates: what to do, how to do it, and what's accepted.

### 7.2 What's Missing

**No first-run onboarding.**  
A new user opening AnEdiKit for the first time sees the Convert Video panel with all dropdowns at their defaults. There's no:
- Welcome screen or guided tour
- Tooltip overlay pointing out key areas (sidebar categories, the search function, Settings)
- Contextual help for what CRF or preset values mean

**No contextual help or documentation links.**  
Parameters like "Quality (CRF)" have a label but no `?` tooltip, info icon, or help link explaining what CRF values mean or what trade-offs different presets involve. A user unfamiliar with FFmpeg has no guidance.

**No tool dependency warnings.**  
If FFmpeg or yt-dlp binaries aren't installed, the tool panel should show a clear empty state explaining the dependency and a "Download FFmpeg" action — not just silently fail when Execute is clicked. The External Tools section in Settings handles installation, but there's no link from the tool panels themselves.

---

## 8. Responsive Design & Small Viewports

### 8.1 Critical: Mobile Layout Is Broken

Based on the mobile screenshots, the mobile experience is essentially non-functional:

- **Dropdowns truncate to 1–2 characters.** In the mobile Convert Video view, "MP4" becomes "M", "H.264" becomes "H", "AAC" becomes "A". The `col-md-4` grid stacks correctly, but the dropdown widths don't adapt — they remain `form-select-sm` at whatever width the single column gives them minus padding and label.

- **Batch queue text overflows.** "Drop files here or click to select" wraps awkwardly, and the format support list breaks mid-word.

- **Estimation readout is unreadable.** The bitrate estimation bar wraps to multiple lines at narrow widths, breaking the single-line design assumption.

- **Command preview is invisible.** The monospace `ffmpeg` command overflows its container with `white-space: nowrap`, so only the first few characters are visible.

### 8.2 Tauri Desktop Context

AnEdiKit is a Tauri desktop app, not a web app. The "mobile" screenshots likely represent a very narrow window rather than actual mobile usage. However:
- Users do resize windows to tile alongside other apps
- Laptop screens at 1366×768 with 125% DPI scaling effectively behave like ~1093×614 viewpoints
- The sidebar at 280px consumes 25% of a 1093px window

### 8.3 Recommendations

| Priority | Change |
|----------|--------|
| **P0** | Set a `min-width` on the window (e.g., 800px) in `tauri.conf.json` to prevent the broken narrow layout. |
| **P1** | At widths below ~900px, auto-collapse the sidebar to icon-only mode (68px). |
| **P1** | Ensure `form-select-sm` dropdowns have a `min-width` so labels remain readable (at least ~100px). |
| **P2** | Wrap the estimation readout as a vertical stack at narrow widths instead of a horizontal bar. |

---

## 9. Accessibility

### 9.1 Good Practices Already Present

- ✅ Sidebar nav items are `<button>` elements (correctly focusable, clickable)
- ✅ `title` attributes on sidebar buttons provide tooltip-level description
- ✅ Hidden `<h1>` for "All Tools" section uses `visually-hidden` class
- ✅ Brand logo title has `role="button"` and `tabindex="0"`
- ✅ `prefers-reduced-motion: reduce` is partially respected (marquee animation disabled)
- ✅ Modal dialogs use `aria-labelledby` and `aria-hidden`

### 9.2 Critical Violations

**`user-select: none` on `body`.**  
This prevents users from selecting and copying ANY text in the entire application — including output file paths, error messages, metadata values, and command previews. This is hostile to usability. Users routinely need to:
- Copy output file paths to paste in file managers
- Copy error messages for troubleshooting
- Select metadata text for reference

> **Recommendation (P0):** Remove `user-select: none` from `body`. Apply it selectively to elements where drag behaviour conflicts with text selection (sidebar nav items, drag handles, timeline controls).

**No `aria-current="page"` on active nav-link.**  
Screen readers cannot determine which tool is currently selected. The active state is communicated only via visual styling (blue background pill + white text).

**No skip-to-content link.**  
Keyboard-only users must tab through 32+ sidebar items before reaching the main content area. A skip link (`<a href="#main-content" class="visually-hidden-focusable">Skip to main content</a>`) is a WCAG 2.1 Level A requirement.

**Window caption buttons have `tabindex="-1"`.**  
The minimize/maximize/close buttons are intentionally removed from tab order. While custom title bars make this a grey area, keyboard-only users have no way to access window controls without Alt+F4 or system shortcuts.

**Colour-only toggle state indication.**  
Toggle switches (Embed Subtitles, Overwrite Confirmation, etc.) rely solely on blue vs grey colour to indicate on/off. No icon, text label, or pattern change accompanies the state change.

**Form labels not always associated.**  
Some parameter labels use `<label>` without `for` attributes, while others use plain `<span>` or `<div>` text above dropdowns. The association between label and control is visual-only.

---

## 10. Motion & Animation

### 10.1 Token System

`motion-tokens.css` defines a well-structured token system:

```css
--duration-stagger: 40ms;     --duration-quick: 150ms;
--duration-fast: 250ms;       --duration-base: 350ms;
--duration-slow: 400ms;       --duration-very-slow: 500ms;

--ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-apple: cubic-bezier(0.25, 0.1, 0.25, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 10.2 Underutilisation

Despite defining these tokens, many animations hardcode their own values:

| Animation | Token? | Actual Value |
|-----------|--------|-------------|
| Sidebar active indicator | No | `0.28s cubic-bezier(0.32, 0.72, 0, 1)` |
| Fluent ripple | No | `2s ease-in` |
| Material ripple | No | `600ms cubic-bezier(0.2, 0, 0, 1)` |
| Toast slide-in | Partial | Uses `--duration-fast` in some places |
| Button progress | No | `0.38s linear` |
| Settings row hover | No | `0.15s ease` |
| Processing marquee | No | `var(--marquee-duration, 8s) ease-in-out` |
| All Tools card hover | Partial | Uses `--duration-fast` and `--ease-smooth-out` |

Only the All Tools card and a few component transitions consistently use the token system. The motion system was designed but not enforced.

### 10.3 `prefers-reduced-motion` Coverage

Only the processing marquee animation respects `prefers-reduced-motion`. The following animations still run at full motion:
- Sidebar active indicator slide
- Fluent proximity border reveal
- Fluent ripple expand
- Material ripple
- Toast slide-in
- Button progress fill
- All Tools card hover lift

> **Recommendation (P1):** Add a global `@media (prefers-reduced-motion: reduce)` block that disables or shortens all transition/animation durations. The existing "Reduce Motion" toggle in Settings should also hook into this.

---

## 11. Specialist Views

### 11.1 Trimmer (Trim & Cut)

The trimmer is the most complex UI in the app, featuring:
- Interactive timeline with filmstrip thumbnails
- Waveform canvas overlay
- Dual range sliders for in/out points
- Playhead position indicator
- Step controls (±0.1s, ±1s)
- Mark Start / Mark End buttons
- Preview Clip button
- Timestamp text inputs with manual entry

**Critique:**
- The timeline area is empty (red-bordered placeholder) before file selection — the red border clashes with the dark theme and signals "error" rather than "empty"
- Too many controls visible simultaneously. The step controls (⏪-1s, ‹-0.1s, ▶ Play, +0.1s›, +1s⏩) AND the Mark Start/Mark End buttons AND the Preview Clip button all compete for attention in a single row
- No keyboard shortcuts displayed for trimmer controls (J/K/L for playback is standard in video editors)
- Timestamp input format `00:00:00.000` requires exact formatting — no tolerance for partial input like "30" meaning "00:00:30.000"

### 11.2 Comparison Modal

The comparison modal is a standout feature with three modes: Split Slider, Side-by-Side, and Onion Skin. The split slider implementation with clip-path polygons and a draggable divider handle is well-executed. The floating toolbar with zoom controls, fit/100% presets, and action buttons is logically grouped.

**Minor issues:**
- The "Before/After" badges use different background colours (dark vs primary) which creates visual weight imbalance
- The floating toolbar `comp-floating-toolbar` doesn't have a backdrop blur on the toolbar itself, so it can blend into the image behind it
- No keyboard control for the split slider position

### 11.3 Image Lightbox

The lightbox modal provides full-preview zoom with metadata (filename, dimensions, file path). The backdrop uses a blur effect with a close button positioned top-right.

**Issue:** The close button is `btn-outline-light` on a dark blurred backdrop — the border can become invisible depending on the image content behind it. A solid semi-transparent background would be more reliable.

---

## 12. Settings UX

### 12.1 What Works

The Settings panel uses a grouped card layout (`settings-group-card`) with consistent row styling (`settings-row`) that includes label, description, and control. This is a clean, scannable pattern reminiscent of iOS/macOS system preferences.

Sections are logically grouped:
1. Appearance & Interface (toggles)
2. Storage Defaults (path, overwrite confirmation)
3. Performance (GPU encoder, threads)
4. Encoding (default codec, preset, format, bitrate)
5. yt-dlp (cookies, speed, sponsorblock, geo-bypass, flags)
6. External Tools (card grid with status)

### 12.2 Issues

**No search/filter in Settings.**  
With 20+ settings across 6 sections, users must scroll to find specific options. A simple search filter at the top would significantly improve findability.

**"Customise Theme" button exists but behaviour is unclear.**  
The top-right "Customise Theme…" button in Settings appears but its relationship to the toggle-based settings is ambiguous — is it a separate modal? A colour picker? The button style (`btn-outline-primary btn-sm`) makes it look like a secondary action rather than a major feature.

**External Tools cards clip on narrow windows.**  
The horizontal scroll container for External Tools cards (`scroll-cards-container`) works well, but the rightmost card label ("Pytho…") is truncated, and there's no visual indicator that more cards exist beyond the visible area (the gradient edge fade is very subtle).

---

## 13. Design System Maturity

### Maturity Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Colour tokens** | 2/5 | No project-level tokens; relies entirely on Bootstrap CSS vars |
| **Spacing tokens** | 1/5 | No custom scale; uses Bootstrap utilities ad-hoc |
| **Typography tokens** | 2/5 | Root sizing defined, but no type scale; inline sizes throughout |
| **Motion tokens** | 3/5 | Well-defined in `motion-tokens.css` but underutilised |
| **Component library** | 3/5 | Consistent patterns (settings rows, tool panels, empty states) but not abstracted |
| **Icon system** | 2/5 | Ionicons used consistently but no sizing scale |
| **Documentation** | 1/5 | No design system documentation, no component inventory |
| **Theming** | 1/5 | Dark-only, no theme switching infrastructure despite "Customise Theme" button |

**Overall design system maturity: Early Stage → Emerging (2.1/5 → 3.4/5) after Visual Design fixes**

| Dimension | Before | After | Notes |
|-----------|--------|-------|-------|
| **Colour tokens** | 2/5 | 4/5 | `design-tokens.css` semantic layer + light/high-contrast overrides |
| **Spacing tokens** | 1/5 | 4/5 | 4px scale + semantic aliases, legacy inline preserved via `inline-legacy.css` |
| **Typography tokens** | 2/5 | 4/5 | `--aek-text-xs`→`--aek-text-xl` scale, utilities `.aek-text-*` |
| **Motion tokens** | 3/5 | 3/5 | Unchanged (well-defined, partially underutilised — see §10.2) |
| **Component library** | 3/5 | 3/5 | Unchanged |
| **Icon system** | 2/5 | 4/5 | `--aek-icon-*` scale + utilities, hero/param col classes |
| **Documentation** | 1/5 | 2/5 | Token file documents system; still no full component inventory |
| **Theming** | 1/5 | 3/5 | Dark-only → light + high-contrast hooks via `[data-bs-theme]` |

The app now has a formalised token foundation; remaining work is enforcement and documentation.

---

## 14. Prioritised Recommendations

### P0 — Critical (Fix Before Next Release)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | Remove `user-select: none` from `body`; apply selectively | Users cannot copy file paths, error messages, or command output | Low |
| 2 | Add `aria-current="page"` to active sidebar nav-link | Screen reader users cannot identify current tool | Low |
| 3 | Add skip-to-content link | WCAG 2.1 Level A violation | Low |
| 4 | Set minimum window width (~800px) in Tauri config | Prevents broken mobile-width layout | Low |

### P1 — Important (Next Sprint)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 5 | Make sidebar sections collapsible | Reduces cognitive load; 32 items → visible section of interest only | Medium |
| 6 | Add `prefers-reduced-motion` support for all animations | Accessibility for vestibular disorder users; leverage existing "Reduce Motion" setting | Medium |
| 7 | Add state labels or icons to toggle switches | Colour-blind users cannot determine toggle state | Low |
| 8 | Auto-collapse sidebar below ~900px window width | Prevents sidebar consuming 30%+ of narrow windows | Medium |
| 9 | Add contextual help/tooltips for technical parameters (CRF, preset, etc.) | Onboarding for non-FFmpeg users | Medium |
| 10 | Consolidate inline `style` attributes into CSS classes | Maintainability, consistency, and themability | Medium-High | **DONE 2026-09-20 — 135 → 0 static inline styles, `inline-legacy.css` + `design-tokens.css`** |

### P2 — Nice to Have (Backlog)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 11 | Create formal design tokens (`design-tokens.css`) for colours, spacing, type | Foundation for theming and consistency | High | **DONE 2026-09-20 — `design-tokens.css` with colour/spacing/type/icon scales + light/high-contrast** |
| 12 | Add "Recent Tools" section to sidebar top | Power user efficiency | Low |
| 13 | Enforce motion token usage across all animations | Design system coherence | Medium |
| 14 | Add Cmd/Ctrl+K command palette for tool switching | Keyboard-first navigation | Medium |
| 15 | Add search/filter to All Tools browser and Settings | Discoverability at scale | Medium |
| 16 | Add visual dependency indicators for tools requiring binaries | Prevents confusion when tools fail | Medium |
| 17 | Group tool parameters into Primary / Advanced (collapsible) | Reduces initial overwhelm for simple use cases | Medium |
| 18 | First-run onboarding flow or contextual tooltips | New user retention | High |
| 19 | Add keyboard shortcuts display to trimmer controls | Editor power-user expectation | Low |
| 20 | Improve trimmer empty-state styling (remove red border) | Visual consistency — red implies error | Low |

---

## Appendix: Screenshot Reference

All critique findings were verified against the v0.5.0 screenshot set:
- Desktop: `docs/screenshots/0.5.0/*.png` (27 tool views + modals)
- Mobile: `docs/screenshots/0.5.0/mobile/*.png` (27 mobile-width captures)
- Historical comparison: `docs/screenshots/0.3.0/` and `docs/screenshots/0.4.2/` for design evolution context

---

*Report generated from static analysis of source code (`index.html`, `base.css`, `layout.css`, `components.css`, `motion-tokens.css`) and visual inspection of v0.5.0 screenshots. No runtime testing was performed.*
