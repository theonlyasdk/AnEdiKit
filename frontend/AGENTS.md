# AnEdiKit Frontend — Agent Instructions

Scope: `frontend/` only. This is the live app (`src-tauri/tauri.conf.json`
→ `frontendDist: ../frontend/dist`). The legacy `src/` vanilla tree at repo
root is dead — never touch it.

Stack: React 19, Tailwind CSS **v3.4.17** (do NOT migrate to v4),
shadcn/ui primitives in `src/components/ui/`, Tauri v2 IPC.
`tailwind-merge` must stay `^2.6.0` (v3.x is v4-only).
`components.json`: `baseColor: "neutral"`, `style: "default"`.

## Design law (non-negotiable)

Grounded in the AI-design-slop research (Krebs' 16-pattern Show HN audit:
decorative badges, icon-topped cards, all-caps labels are measured tells of
vibe-coded UI; SmoothUI's closed-loop critique discipline). The founder has
explicitly banned these — do not reintroduce them in any new code:

1. **No decorative badges.** `Badge` is reserved for live dynamic data that
   aids a decision (tool counts, app version, running-job status). Never a
   static label pill (`SYSTEM CONFIG`, `MODULE ACTIVE`, category stamps).
   If the text never changes, it is not a badge — delete it.
2. **No kicker babble under headings.** An `h1` stands alone or with one
   plain-language description sentence. Never a mono `//`-separated shout
   (`PATHS // ACCELERATION // …`) or a capability chant under a tool title.
3. **No icon chips.** Never wrap an icon in a tinted rounded box
   (`bg-primary/10 border border-primary/20 rounded-*`). Icons sit directly
   on the surface (`text-primary` or inherited) with no background container.
4. **No uppercase shouting.** Never combine `uppercase` + `tracking-widest`
   on content. Sentence case everywhere: headings, nav labels, filenames,
   empty states, section titles.
5. **`font-mono` is for machine data only** — file paths, logs, codecs,
   numbers. Never for prose labels, headings, or buttons.
6. **No numbered-section theater** (`01.`, `02.`, `STEP 1`). Sections get
   plain descriptive headings (`Input file`, `Encode settings`).
7. **No card-left-border / glow / gradient decoration.** Customize shadcn
   through theme tokens, not one-off decorative treatments.
8. **Clickable cards use the block-button pattern**: `Card` is `relative`,
   visuals stay visible, and one absolutely-positioned transparent `button`
   with a real `aria-label` covers it. Never wrap a card in `<a>`, never
   `onClick` on a `div` without role + keyboard handling.

## Honesty law (non-negotiable)

9. **No fake functionality.** A control that does nothing is a bug, not a
   TODO. Settings must persist (`src/lib/settings.ts`, localStorage) and
   be read where they take effect (Convert reads them at execution time).
   Nav and grids must never advertise unbuilt tools: gate them behind
   `AVAILABLE_TOOLS` in `Sidebar.tsx` as disabled "coming soon" entries.
10. **Every failure surfaces.** The app mounts `<Toaster/>` — use it.
    `console.error`-only catches are banned in user flows: probe errors,
    dialog errors, IPC errors, validation errors, and finish payloads
    (`message` + `exit_code`, never swallowed) all produce toasts and/or
    inline `role="alert"` states.
11. **Destructive actions confirm.** Overwrite prompts via `AlertDialog`
    unless the user opted into auto-overwrite. Dismissing a running job's
    console confirms, and the console stays re-openable from the tool view.
12. **No hardcoded personal data.** No machine paths, no hardcoded version
    (titlebar reads `getVersion()` from `@tauri-apps/api/app`, `dev`
    fallback in browser). Footer/status chrome shows real view titles from
    the `TOOLS` registry, never raw route slugs.

## Accessibility baseline

- Every icon-only button has `aria-label`; decorative icons get
  `aria-hidden="true"`. No `title`-only tooltips on controls.
- Active nav items use `aria-current="page"`; truncated labels get Tooltips
  (app root is wrapped in `TooltipProvider` — tooltips crash without it).
- Dropzones and pickers are keyboard-operable (`role="button"`, `tabIndex`,
  Enter/Space handling). Logs use `role="log"`.
- `.dark` lives on `<html>` (via `ThemeProvider` + `index.html` FOUC
  script) — never on a nested div, or portaled Radix overlays render in the
  wrong theme. Theme state: `useTheme()` from
  `@/components/theme-provider` (`light` | `dark` | `system`).
- Titlebar caption buttons are Windows-exact: `h-10 w-[46px]`,
  `rounded-none`, flush to the corner (`-mr-3.5`), 10px 1px-stroke glyphs,
  close hovers `#E81123` with white glyph. Do not "round" or "soften" them.

## Rust IPC contract (verified against `src-tauri/src/*.rs`)

- `pick_file(filterMode: Option<String>)` — values `pdf|image|audio|video`,
  never extension arrays. `pick_folder(defaultPath?)`, `pick_files` exists.
- `check_file_exists(filePath)`, `show_in_folder(filePath)` (there is NO
  `open_file_folder` command).
- `get_media_info` returns flat `MediaInfo` (no `format`/`streams`
  nesting). Absent fields arrive as `"--"`; missing codecs as `"None"`;
  image resolution as `"N/A"`.
- `execute_ffmpeg(app, args, totalDuration?)` — **always pass
  `totalDuration`** or progress `pct` stays 0.
- Progress events emit `pct` (not `percent`); finish emits
  `{ success, exit_code, message }`.
- Events: `ffmpeg-progress`, `ffmpeg-log`, `ffmpeg-finished`,
  `confirm-exit-requested`. In browser dev (no Tauri runtime) `listen()`
  throws — always guard listener setup.

## Workflow

- `cd frontend; npm run build` — must stay green. `npx oxlint` — zero errors
  (shadcn-primitive fast-refresh warnings are pre-existing; fix only yours).
- After UI changes: launch `npm run dev`, screenshot in the browser in
  **both** themes, check console for errors, then kill the server.
- On Windows the shadcn CLI writes to a literal `frontend/@/` dir — check
  `git status` after every `shadcn add` and relocate strays.
- Validate files after writing (this environment has corrupted output with
  control chars before):
  `node -e "const s=require('fs').readFileSync(P,'utf8');let b=0;for(const c of s){const n=c.charCodeAt(0);if((n<9)||(n>13&&n<32))b++}console.log('bad',b)"`
