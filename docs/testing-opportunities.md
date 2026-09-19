# Testing Opportunities

Current state: 253 tests across 16 files in `test/unit/`, plus 4 Rust tests in
`src-tauri/src/system.rs`. Zero Python tests, zero tests for `tools/Scripts`.
Opportunities below, ordered by value per effort; finished items are marked DONE.

## Highest value

- DONE (`test/unit/command_builders.test.js`): Golden tests for the FFmpeg/yt-dlp command builders in `src/js/commands.js`
  (`buildConvertCommand`, `buildTrimCommand`, `buildMergeCommand`, `buildYtDlp*Command`,
  `buildCommandForTool`, etc.). These are pure functions and CLI transparency is a core
  feature. Assert exact arg strings for representative inputs, including edge cases from
  the fixed audit (paths with `%`, `&`, spaces).
- DONE (`test/unit/image_commands.test.js`): Same golden pattern for the 7 builders in
  `src/js/image_commands.js` plus `resolveImageAiDestinationPath` (explicit dir, source
  dir, saved dir, POSIX vs Windows separators, JPEG-to-PNG coercion on replace).
- DONE (`test/unit/pure_helpers.test.js`): Pure helper tests: `normalizeYtDlpTemplate` and `sanitizePlaylistItems`
  (`commands.js`), `parseTimestampToSeconds`, `isAudioPath`, `audioCodecToContainer`,
  `resolveDestinationPath`. All pure, all fit the existing mock setup in
  `test/unit/setup.js`.
- DONE (`test/unit/pure_helpers.test.js`): Time/format utils in `src/js/trimmer.js`:
  `formatSecondsToTimestamp`, `parseTimestampToSeconds`,
  `isAudioFile`/`isImageFile`/`isVideoFile`, including truncation, clamping, and a
  format/parse round-trip.

## Additional pure and state modules

- DONE (`test/unit/ytdlp_url.test.js`): `fixYoutubeUrl` normalization (youtu.be,
  shorts/live/embed, music/mobile hosts, playlist links) and tracking-param stripping.
- DONE (`test/unit/ytdlp_format.test.js`): filename template parse/compile/preview and
  round-tripping.
- DONE (`test/unit/commands_options.test.js`): `getResolvedHwaccel`, `mapHardwareEncoder`,
  `getHwaccelInputArgs`, and `applyVideoEncoderOptions` per backend (CRF vs bitrate,
  NVENC preset ladder, QSV/AMF/VideoToolbox flags).
- DONE (`test/unit/storage_kits.test.js`): user-kit CRUD, per-tool and per-kit params
  normalization, and misc storage getters/namespacing.
- DONE (`test/unit/theme_io.test.js`): theme text serialize/parse round-trip and DOM
  application (palette vars, blur gating/clamping, font stack, animation toggle).
- DONE (`test/unit/waveform.test.js`): `extractPeaksFromAudioBuffer` normalization and
  `generateSyntheticWaveform` determinism/range.
- DONE (`test/unit/media_batch.test.js`): batch queue add/dedupe, indexed reorder,
  selection-based moves, status transitions, and persistence.

## Consistency and contract tests

- DONE (`test/unit/contract.test.js`): Every `data-tool` button in `src/index.html` has
  an entry in `TOOL_METADATA` (`src/js/navigation.js`) and a branch in
  `buildCommandForTool` (`commands.js`). The suite loops all three sources and fails
  loudly when a tool is added to the UI but not the backend (and vice versa).
- DONE (`test/unit/contract.test.js`): `tools-manifest.json` schema test: every entry
  has `id`/`binName`/`downloadSources`, and icon names exist in the Ionicons set.
- DONE (`test/unit/contract.test.js`): localStorage namespace invariant. All
  `STORAGE_KEYS` values start with `anedikit:`, `storage.js` routes every key through
  `STORAGE_KEYS` (no ad-hoc literals), and every string-literal `localStorage` key
  anywhere under `src/` is namespaced (mandated in `src/GEMINI.md`).

## State and queue logic

- DONE (`test/unit/queue_state.test.js`): `audio_tags.js` queue ops
  (`clearAudioTagQueue`, `removeTrackFromQueue`, `selectTrack`) and `image_queue.js`
  (`updateImageAiItemStatus`, `removeImageAiQueueItem`, `clearImageAiQueue`). Pure
  state transitions in the same style as the existing `merge.js` test, including
  out-of-range guards and selection shifting after a removal. `audio_tags.js` gained a
  `getSelectedTrackIndex()` getter (mirrors `getAudioTagQueue`) so selection state is
  observable.
- DONE (`test/unit/queue_state.test.js`): Settings round-trip through
  `storage.js`/`app_settings.js` beyond get/set: defaults merge, corrupt-JSON
  recovery, nested round-trip, and `setAppSettings` non-aliasing.

## Rust backend

Run with `cargo test`. `system.rs` now has a `#[cfg(test)]` module; `tools.rs`,
`media.rs`, and `jobs.rs` still have none.

- DONE (`src-tauri/src/system.rs`): temp-file round trip (`write_temp_text_file` to
  `check_file_exists` to `replace_file`) using `std::env::temp_dir()`, plus the
  missing-source error case and file-vs-missing-path coverage for `check_file_exists`.
- DONE (`src-tauri/src/system.rs`): `percent_decode_path` regressions behind the
  `%`-in-filename bugs, e.g. `Promo_100%_Final.mp4` (plain path kept verbatim) and
  `%20`/`%25`/`%2F` decoding of `file://` URLs, `localhost` authority, and legacy
  `C|` drive prefixes.
- Version-string parsing and normalization inside `tools.rs` (`check_tool_versions`).
  `probe_encoder_available`/`probe_hwaccel_available` gated on an env-provided ffmpeg
  binary or tiny fixtures from `test/videos/`.

## Python engine

Add `pytest` to `requirements.txt`. Currently no tests for `src/py/image_ai_engine.py`.

- Pure functions: `format_seconds_hms`, `contour_to_svg_path`, `get_asdk_dir`.
- Unicode path round-trip: `cv2_imread_unicode`/`cv2_imwrite_unicode` with tmp dirs.
  Directly guards the OpenCV Unicode failures from the audit.
- `safe_save_file` fallback behavior with read-only destinations.

## Build tooling

Currently zero tests for `tools/Scripts`, despite testability hooks.

- `run_release.js` exports `findReleaseBinary()`. Test with fixture dirs.
- `prompt.js` exports `createPrompter()`. Test with in-memory streams (the signature
  already supports injection).
- `build_release.js` exports nothing today. Exporting the pure helpers
  (`parseMsixOptions`, `toMsixVersion`, `escapeXml`, `buildMsixManifest`) plus the
  already-injectable `runInteractiveSetup`/`performCleanup` unlocks manifest golden
  tests and cleanup tests on temp dirs.

## Free smoke test already owned

`tools/Scripts/capture_screenshots.js` walks every page and fails the run on bad
captures. Running `npm run screenshots` in CI is a full-UI smoke test with zero new
code. Consider a `--check-only` flag if full captures are too slow for CI.

## Test infrastructure

- Split `submodules.test.js` (283 lines, 10 suites) into one file per module.
- Run with `node --experimental-test-coverage` and fail under a threshold so coverage
  cannot silently regress.
