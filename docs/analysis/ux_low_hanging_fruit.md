# AnEdiKit UX Low-Hanging-Fruit Audit

Static review of the frontend (markup, styles, and interaction code) for small,
low-risk UX defects. This is a code audit only: no runtime walkthrough of the running
Tauri app was performed, so anything that depends on rendered geometry or live state is
called out as an open item rather than a finding.

Artifacts reviewed: `src/index.html`, `src/css/*.css`, `src/js/*.js`, `src/kits/*.js`,
`src/main.js`.

## Summary

| Area | Result |
| --- | --- |
| Native browser dialogs | 3 issues found, 3 fixed (plus 2 low-priority fallbacks) |
| Accessible names on controls | Clean |
| Form control constraints | Clean |
| Cursor affordance on selects/dropdowns | Clean |
| Clipboard success feedback | Clean |
| Keyboard focus visibility | Audited: 2 gaps fixed, 0 remaining |

## Findings

### 1. Native `confirm()` dialogs in the User Kits flow [FIXED]

The app standard is Bootstrap 5 modals (see `showCustomKitAlert` and
`showCustomKitPrompt`), but three destructive actions still used the native blocking
`confirm()`:

- `src/kits/editor.js:645` - "Reset current script to the default starter template?"
- `src/kits/editor.js:664` - "Clear script contents?"
- `src/kits/settings.js:53` - Delete kit confirmation (`Are you sure you want to delete the kit ...?`)

Why this matters:

- WebView2 renders native dialogs outside the app's visual language, and they can be
  suppressed or behave inconsistently compared to Chromium tabs.
- The native dialog is synchronous and blocks the renderer, which stalls animations and
  the command-log view behind it.
- It is the only place in the app where a confirm prompt is not a Bootstrap modal, so it
  breaks the "keep interactions consistent across the app" rule in `src/GEMINI.md`.

Applied fix: added `showCustomKitConfirm(message, options)` to `src/kits/modals.js`
(reusing `ensureCustomKitModals`, which now also builds `#modal-kit-confirm`). It
resolves a boolean, supports `title`, `confirmLabel`, `cancelLabel`, and a `danger`
variant that swaps the confirm button to `btn-danger` and the header icon to
`warning-outline`. The helper still falls back to `window.confirm` only when
`bootstrap.Modal` is unavailable.

In-progress state: callers pass an `onConfirm` handler so the dialog owns the action.
On confirm the modal stays open, the confirm button disables and shows a Bootstrap
spinner with a per-action label (`Resetting…`, `Clearing…`, `Deleting…`), and the
Cancel button disables too. The handler runs after one animation frame so the busy
state paints before any synchronous script rewrite or kit re-render blocks the thread.
On success the modal closes and the promise resolves `true`; on failure the buttons
reset, the message shows `Action failed: <reason>`, and the dialog stays open for retry.
Call sites:

### 2. Last-resort dialogs in `src/kits/modals.js`

- `src/kits/modals.js:67` - `window.alert(message)` when `bootstrap.Modal` is missing.
- `src/kits/modals.js:107` - `window.prompt(message, defaultValue)` when `bootstrap.Modal` is missing.

These are guarded fallbacks that only run when Bootstrap failed to load, so they are not
reachable in normal operation. Low priority; leave as a safety net unless Bootstrap is
made a hard dependency.

## Verified clean (with evidence)

- Accessible names: all 149 `<button>` elements in `src/index.html` declare `type=`; the
  ones without a `title=` are text-labelled controls or `.btn-close` with
  `aria-label="Close"`. 24 `aria-label` attributes are present overall.
- Form constraints: all 12 `type="number"` inputs in `src/index.html` declare
  `min`/`max` (and `step` where fractional), so invalid ranges are constrained at the
  input level.
- Cursor affordance: `src/css/base.css` applies `cursor: pointer` to `select`,
  `.form-select`, `.dropdown-toggle`, and `[data-bs-toggle="dropdown"]`.
- Clipboard feedback: every `navigator.clipboard.writeText` call site provides visible
  success feedback, per the `src/GEMINI.md` rule:
  - `src/js/execution.js:913` - `btn-success` + `animateCopyConfirm`
  - `src/js/runner.js:908` - `.copied` class + `animateCopyConfirm` + title swap
  - `src/js/comparison.js:440` - toast
  - `src/kits/editor.js:587` - inline "Copied!" state
  - `src/kits/runner.js:225` and `:240` - `btn-success` / `animateCopyConfirm`
- No inline `onclick=` handlers were found in generated HTML. (One inline `onerror=`
  fallback exists in `src/js/image_queue.js` for broken thumbnails; noted but not a UX
  defect.)

## Focus visibility audit [FIXED]

All ten `outline: none` declarations were reviewed. Two selectors stripped focus with
no replacement and were fixed; the rest are benign.

Fixed:

- `.trim-range-slider` (`src/css/media_preview.css:132/140/147/154/170/188`): the input
  is a transparent, full-size track, so the ring now renders on the draggable thumb for
  both `::-webkit-slider-thumb` and `::-moz-range-thumb`, overriding the existing
  `box-shadow: none !important`.
- `#btn-mobile-menu` (`src/css/layout.css:595`): the shared
  `:hover/:focus/:active` reset removed the default ring; added a later `:focus-visible`
  rule so it wins on equal specificity.
- `#brand-logo-title` (`src/css/layout.css`): a keyboard-reachable `role="button"`
  heading that previously fell back to the low-contrast UA outline on the dark header;
  it now uses the app's primary ring.

Benign (focus already visible, or element not focusable):

- M3 switches (`src/css/m3_switches.css:105`): focus rings are already defined on
  `:focus` (`0.25rem` and `3px` variants).
- `.header-caption-btn` (`src/css/titlebar.css:79`): window caption buttons carry
  `tabindex="-1"` and are intentionally outside the tab order, matching native Windows.
- `.brand-header-btn` (`src/css/layout.css:563`): a non-focusable `<div>` wrapper; the
  keyboard-reachable control is the `#brand-logo-title` heading inside it.

## Manage Tools cache controls relocated [FIXED]

The update-cache controls used to sit in the Settings view, away from the tools they
describe. Both now live in the Manage Tools dialog:

- `#tools-cache-status-text` moved to the top of the dialog's `.modal-body`, above the
  tool rows it summarizes, and is re-rendered on the dialog's `show.bs.modal` event so
  its relative age ("Last checked 15m ago") is current on every open instead of only
  when a background fetch happened to land.
- `#btn-clear-tools-cache` moved into the dialog's `.modal-footer` next to "Check for
Updates".
- The clear button shows an in-progress sweep while it works: disabled, relabelled
  "Clearing...", and switched from `btn-outline-secondary` to
  `btn-secondary btn-shimmer`. The swap to a filled variant is deliberate - the outline
  button is transparent, so the `btn-shimmer` gradient sheen does not read on it.

One behavioral consequence of sharing a footer: the clear button is now reachable while
another tool operation runs. `lockToolsCacheButton()` in `src/js/tools_manager.js`
disables it for the duration of any update or delete and restores the previous disabled
state, so an in-flight clear is never re-enabled by an unrelated operation.

Placement is locked in by the `Contract: Manage Tools cache controls placement` suite in
`test/unit/contract.test.js` (exactly one instance of each id, each inside
`#manage-tools-modal`, and `app_settings.js` ids agreeing with the markup). Details in
`docs/components/tools_update_cache.md`.

## Open items (not low-hanging)

- Runtime UX checks (empty/loading/error/disabled states per tool) need the running app;
  a screenshot pass via `npm run screenshots` is the cheapest way to catch regressions
  there.

## Method

Static greps over `src/` for native dialog calls, `clipboard.writeText`, `aria-label`,
`<button>` without `type=`, `type="number"` without `min`/`max`, `cursor: pointer`,
`:focus-visible`, and `outline: none`, followed by reading each flagged call site.
