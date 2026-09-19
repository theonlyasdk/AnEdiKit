# AnEdiKit Android Blueprint

Purpose: full technical summary of the AnEdiKit desktop project so an Android version can be built from the same general idea without re-reading the desktop codebase.

AnEdiKit today: lightweight all-in-one desktop media toolkit (Tauri v2 + Rust backend + HTML/CSS/JS frontend + Python AI engine). Version 0.2.0. MIT licensed. Core idea: one predictable workspace that wraps FFmpeg, yt-dlp, and local neural image tools behind consistent forms, with live CLI preview, background execution, progress and logs, batch queues, and a scriptable macro system called User Kits.

This document describes what to port, what to change for Android, and how.

## 1. Product idea in one page

### 1.1 What the desktop app does

1. Pick input: single file, multi-file merge list, batch queue, image queue, or URL.
2. Pick tool from sidebar: 14 FFmpeg video/audio tools, 6 Image and AI tools, 4 yt-dlp downloaders, plus Settings and custom User Kits.
3. Configure parameters in a form. Command preview and size estimate update live.
4. Execute. Job runs in background without freezing UI. Progress bar, ETA, speed, FPS, bitrate, and log console update in real time.
5. Finish: toast plus system notification, reveal output, compare before/after for images, keep queues persistent across restarts.

### 1.2 Design principles worth keeping on Android

* On-device by default: no upload to a server for transcode or AI work.
* Async and non-blocking: user can switch tools while a job runs.
* Predictable workflow: same layout for every tool: input card, params, command preview, log, progress, Execute/Reset/Cancel.
* CLI transparency: always show the exact FFmpeg or yt-dlp command being run, with copy button. On Android this becomes an educational and debugging feature even if the actual execution uses FFmpegKit or Media3 APIs.
* Extensibility: User Kits let power users build their own mini GUIs for CLI binaries.
* Bootstrap-like restraint: dense utility UI, no marketing landing patterns, clear empty/loading/error/success states.

### 1.3 What not to port literally

* Window caption controls, custom titlebar modes, desktop drag regions.
* `C:\Videos` style absolute output dirs, `explorer /select`, WinRT toasts via PowerShell.
* Direct spawning of `ffmpeg.exe` from PATH. Android needs FFmpegKit / NDK builds plus MediaCodec.
* yt-dlp as a plain subprocess. This is the hardest part on Android, see section 6.
* Python `rembg` + `opencv` desktop scripts as-is. Use ONNX Runtime Mobile / ML Kit / OpenCV Android SDK instead.
* Monaco editor + Deno kits runtime as-is. Simplify Kits on mobile, see section 8.

## 2. Complete tool inventory

Desktop has 24 built-in views plus dynamic `kit_<id>` views. Order is defined in `src/js/navigation.js` (`TOOL_METADATA`, `TOOL_ORDER`).

### 2.1 FFmpeg suite (14 tools)

All builders live in `src/js/commands.js`, dispatched by `buildCommandForTool(toolId, ...)`. Global helpers:

* `resolveDestinationPath`: custom dir > input dir > settings output dir.
* `getResolvedHwaccel`: settings `auto` probes detected hardware `nvidia -> cuda`, `intel -> qsv`, `amd -> amf`, else `cpu`.
* `mapHardwareEncoder`: `libx264 -> h264_nvenc / h264_qsv / h264_amf`, same for HEVC, AV1, VP9 where supported.
* `applyVideoEncoderOptions`: NVENC `-cq + preset p1-p6`, QSV `-global_quality`, AMF `-rc cqp`, CPU `-crf -preset`, SVT-AV1 preset map.

Per tool summary with key params (full param IDs are in `docs/localstorage_keys.md`):

1. `convert` - Convert Video Formats
   Params: container (mp4/mkv/webm/mov/avi/gif/webp), vcodec (H.264/HEVC/AV1/VP9/copy), acodec, crf, preset, scale, gif fps/quality, webp fps/quality.
   Logic: optional `-hwaccel cuda/qsv/d3d11va -threads N`, optional `scale+pad`, encoder options, `-c:a aac/mp3/opus/flac -b:a 192k`. GIF branch uses `fps,scale:-1:flags=lanczos,split+palettegen/paletteuse -an`. WebP uses `-c:v libwebp -loop 0 -q:v / -lossless`.
   Output suffix: `_converted`.
2. `compress` - Compress Video to target MB
   Params: preset (discord 24MB, nitro 500MB, whatsapp 15MB, email 20MB, reduce 50/75pct, custom MB), scale, vcodec.
   Logic: `totalKbps = MB*8192*0.95 / duration`, `videoKbps = total - audioKbps (64/96k)`, then encoder with `bitrate/maxrate/bufsize` plus `aac`.
   Suffix: `_compressed`.
3. `trim` - Trim and Cut Media
   Params: start/end timestamps, mode (lossless copy vs re-encode).
   Logic: copy branch `-ss -to -i -c copy`, re-encode `libx264 crf20 + aac 192k`. Audio-only branch handled.
   Suffix: `_trimmed`.
4. `speed_motion` - Speed and Motion Control
   Params: speed 0.25-16x (slider plus select plus number, kept in sync), audio mode (strip/drop/atempo keep), interpolation (tblend/minterpolate mci), container.
   Logic: video `setpts=1/speed*PTS`, audio `atempo` chain split for values above 2.0 or below 0.5.
   Suffix: `_<speed>x`.
5. `aspect_crop` - Aspect Ratio and Crop
   Params: ratio (9:16/1:1/21:9 etc), mode (center_crop/pad_black/pad_blur/fit_scale), crf, container.
   Logic: `center_crop crop=min()`, `pad_black pad=max()`, `pad_blur scale+crop+boxblur+overlay`, `fit_scale scale`.
   Suffix: `_<ratio>`.
6. `stabilize` - Video Stabilization
   Params: smoothness, border handling, container.
   Logic: `deshake rx/ry 16/32/64 edge blank/mirror + crop/scale`, crf20.
   Suffix: `_stabilized`.
7. `loop_duration` - Loop to Duration
   Params: mode (to time vs repeat count), target hh/mm/ss, repeat count, engine, audio mode, container/vcodec.
   Logic: `-stream_loop -1 -t` or `-stream_loop n-1`, `-an` or `-c:v copy/-c:a copy` vs re-encode.
   Suffix: `_looped`.
8. `normalize` - Volume Normalization
   Params: target (-14/-16/-23 LUFS/custom, TP, LRA11), engine (loudnorm/dynaudnorm/volume), video mode, acodec.
   Logic: `loudnorm I=...` or `dynaudnorm` or `volume`, `-c:v copy` vs `-vn`.
   Suffix: `_normalized`.
9. `mute_replace` - Mute or Replace Audio
   Params: action (strip/replace/mix), second audio path, second audio volume.
   Logic: strip `-an -c:v copy`; replace `-map 0:v -map 1:a -c:v copy -c:a aac -af volume -shortest`; mix `amix` filter_complex.
   Suffix: `_audio_edit`.
10. `gif_frames` - GIF and Frame Extraction
    Params: mode (gif_hq/snapshot/frames_seq), fps, width, start, duration, snapshot format.
    Logic: gif_hq `fps+scale+palettegen/bayer`, snapshot `-frames:v 1`, frames_seq `fps+scale`.
    Suffix: `_animated/_snapshot/_frame_%04d`.
11. `extract_audio` - Extract and Convert Audio
    Params: format (mp3/m4a/flac/wav/opus/ogg/copy), bitrate, bit depth, channels, sample rate, volume.
    Logic: `-vn`, copy vs `pcm_s16le/s24le/f32le/flac/libmp3lame/aac/libvorbis/libopus/wmav2/ac3` plus `-b:a/-ac/-ar/-af loudnorm/volume -map_metadata 0`.
    Suffix: `_extracted`.
12. `compress_audio` - Compress Audio
    Params: preset/custom MB, format, bitrate, channels, sample rate.
    Logic: bitrate budgeting per preset, FLAC branch `-compression_level 8`, else `libopus -vbr on / libmp3lame / aac / libvorbis`.
    Suffix: `_compressed`.
13. `merge` - Merge and Concatenate
    Params: engine (concat_demuxer vs re-encode), format.
    Logic: demuxer `-f concat -safe 0 -i list.txt -c copy` (list written via temp text file), else `filter_complex concat=n:v=1:a=1` or `v=0:a=1` plus re-encode.
    Suffix: `_merged`. Requires at least 2 inputs.
14. `custom` - Custom FFmpeg Command
    Params: extension, raw args string split with quote awareness.
    Logic: `-i src + splitArgs(custom)`.
    Suffix: `_custom`.

Size estimator in `src/main.js:updateEstimatesUI` mirrors the above: CRF to bitrate via `2^(23-crf)/6` times codec efficiency (H264 1.0, HEVC 0.55, AV1 0.45, VP9 0.65) plus container overhead, PCM/FLAC math, per-tool duration adjustments for trim/speed/crop/loop/merge/mute/gif. Port this estimator so mobile users see output size before running.

### 2.2 Image and AI suite (6 tools)

Builders in `src/js/image_commands.js`, executed as `python src/py/image_ai_engine.py --task <task> --params '<json>'`. Desktop models live under `%LOCALAPPDATA%/ASDK/AnEdiKit/models/{bg_remover,upscaler,torch,huggingface}` with `U2NET_HOME/TORCH_HOME/HF_HOME` overrides.

* `bg_remover`: models u2net/isnet/birefnet/silueta/fake_transparency, output modes transparent/solid_color/blur_bg, bg color, blur radius, replace source toggle, device. Uses `rembg new_session` plus direct ONNX plus grabCut fallback. Fake transparency mode synthesizes checkerboard detection with flood-fill cleanup.
* `ai_upscaler`: scale 2x/3x/4x, model, denoise. Desktop does Lanczos plus CLAHE/color/sharpen (`clarity_hdr/anime/bicubic`), bilateral denoise, sharpness 1.35. Real ESRGAN weights optional.
* `vectorizer`: modes kmeans/posterize/line_art, num colors, tolerance, monochrome color. OpenCV kmeans plus Canny plus contour to SVG path layers.
* `restore_denoise`: methods nlmeans/bilateral/deblur_sharpen/clahe_enhance/guided_filter, strength. Alpha preserved.
* `icon_generator`: fit modes contain/cover/stretch, bg color. Input image plus output dir, produces `favicon.ico` (7 sizes) plus 5 PNG plus `site.webmanifest`.
* `metadata_cleaner`: action view/strip. PIL `getdata/putdata` strip, reports tags removed.

Output suffixes: `_nobg`, `_<s>x_upscaled`, `_vector`, `_restored`, `_icons`, `_clean`. All respect in-place replace toggle.

### 2.3 yt-dlp suite (4 tools)

Shared helpers: `appendGlobalYtDlpArgs` (cookies from Chrome/Firefox/Edge/Brave/Opera/Vivaldi, rate limit, SponsorBlock removal, geo bypass, retries 10, fragment 10, socket 15, compat manifest, extractor args `android,web` or `android,ios` for music.youtube, no-mtime, custom args), `normalizeYtDlpTemplate` (single `%(ext)s`), `sanitizePlaylistItems`, `appendYtDlpFilenameSafety (--restrict --trim)`.

* `ytdlp_video`: resolution, container, embed subs/thumb/meta. Flags `--no-playlist -f bv*+ba/b -S ... --merge-output-format`.
* `ytdlp_audio`: format, quality, embed thumb/meta. Flags `-f ba/b -x --audio-format --audio-quality`.
* `ytdlp_playlist`: mode, items filter, autonumber, ignore errors. Flags `--yes-playlist -i? --playlist-items` plus `-o %(playlist_title)s/%(playlist_index)s - ...`. Has Fetch step (`fetch_playlist_videos`) with checkbox list, sort (original/title/duration), toggle-all, then Download(n).
* `ytdlp_subtitles`: language, format, auto subs, thumb, info json. Flags `--skip-download -i --write-subs --sub-langs --sub-format --convert-subs --write-auto-subs --write-thumbnail --write-info-json`.

Filename format editor in `src/js/ytdlp_format.js`: 14 tokens, parse/compile/preview, presets, reset, live sample.

### 2.4 Settings

Keys in `anedikit:settings`: output dir, prompt overwrite, enable notifications, disable animations, enable user kits, use system titlebar (desktop only), custom font, hw accel (auto/cpu/cuda/qsv/amf), thread count, default vcodec/speed/audio format/audio bitrate, yt-dlp cookies/rate limit/sponsorblock/geo bypass/auto paste/custom args/filename format, ffmpeg/ffprobe bin paths. Binaries manifest in `src/data/tools-manifest.json`: ffmpeg, ffprobe, ytdlp, deno, python with display name, repo, release type, update support.

### 2.5 User Kits macro engine

Opt-in via `enableUserKits`. When disabled, `kit_*` routes redirect to Convert. Components in `src/kits/`:

* `state.js`: active kit, active tab (runner/builder/script/settings), runtime values, Monaco instance.
* `blocks.js`: 11 block types in 3 categories: INPUT `file_input`, OUTPUT `folder_picker/output_filename`, SETTINGS `select/text/textarea/number/slider/checkbox/radios/alert_box`. Each has default config, instance factory, HTML renderer, sanitizer.
* `templates.js`: starters `converter/audio_filter/blank` with blocks plus script `buildCommand(ctx)`, ID generator, default sample kit.
* `sidebar.js`: dynamic `kit_<id>` nav buttons, context menu (open/properties/export/duplicate/delete), new-kit wizard with duplicate check, icon map.
* `workspace.js`: IDE workspace with header plus segmented tabs plus indicator, per-kit remembered tab.
* `runner.js`: renders live kit form, browse/clear/file meta, copy cmd/logs, unknown block removal.
* `executor.js`: `AsyncFunction(ctx,alert,prompt)` sandbox with helpers `getDefaultOutputDir/getSettings/joinPath/splitArgs/alert/prompt`, validates required fields, calls shared FFmpeg runner.
* `builder.js`: visual builder with add dropdown, batch modify matrix, drag reorder, accordion editors, option rows.
* `editor.js`: Monaco CDN 0.45.0, 10 themes, autosave 5s, Ctrl+S, save/format/insert vars/copy/export/import/reset/clear, base64 obfuscation with `@anedikit-obfuscated` marker.
* `settings.js`: metadata form (name/id/version/author/license/icon/desc) with ID migration, export JSON, duplicate, delete.
* `modals.js`: custom alert/prompt, universal dropdowns.

Mobile takeaway: keep the block plus script split, but replace Monaco with a simpler code field and restrict execution to FFmpeg/Media3 operations for safety.

## 3. Frontend architecture to mirror

### 3.1 Desktop file map

* `src/index.html`: single-page shell. Top header (brand, tool title/desc, caption controls), left sidebar 280px (FFmpeg 14, Image AI 6, yt-dlp 4, user kits dynamic, settings), main workspace with shared input card, image queue card, URL card, 24 tool views, execution footer (command preview, log console capped at 500 lines, progress bar, status, Execute/Reset), toasts, modals (manage tools, filename editor, image comparison, lightbox, confirm exit).
* `src/main.js`: orchestrator. State save/restore per tool, smart output filename per tool, middle-ellipsis path display, execute button state machine, estimates, speed slider sync, format conditional UI, all form bindings, merge/batch handlers, hardware populate, settings sync.
* `src/js/`: `storage.js` (keys/defaults/CRUD), `media.js` (current input, probe, preview morph, pickers, batch queue), `commands.js` + `image_commands.js` (builders), `runner.js` (execute/cancel/logs/progress/finish/notifications), `navigation.js` (switch with directional slide and zoom, mobile drawer), `trimmer.js` (timestamps, timeline thumbs, sliders), `waveform.js` (peaks, synthetic fallback, canvas), `playback.js` (controller singleton), `preview_providers.js` (image/audio/video strategy), `image_queue.js` (AI queue), `tools_manager.js` (version check, GitHub releases, install/update), `theme.js` (10 presets, CSS vars, import/export), `ytdlp_format.js` (token editor), `comparison.js` (before/after split/side/fade with zoom/pan), `copy_anim.js`, `drag_reorder.js`, `m3_switch.js`, plus `blocks.js`/`kits.js` bridges.
* `src/py/image_ai_engine.py` (1023 lines): CLI `--task --params`, progress lines `ANEDIKIT_PROGRESS:{pct,msg,...}`, result `ANEDIKIT_RESULT:{...}`, tqdm hook, model download, rembg sessions, upscaler, vectorizer, restore, icon bundle, metadata strip.
* `src/styles.css` (2306 lines) + `motion-tokens.css` (39 lines): Bootstrap-first overrides, preview morpher (16:9 video vs 1:1 audio), trim timeline (filmstrip, dimmers, selection, playhead), queues with drag states, comparison/lightbox, toasts, M3 switches, shimmer/pulse/spin, `no-animations` switch. Motion tokens: durations stagger 40/micro 80/quick 150/fast 250/medium 350/slow 400/very-slow 500ms, easings smooth-out/in-out/out/linear/bounce, distances 4/6/8/12/30px, scales 0.96-0.99, blurs 2/3/8px.
* `src/vendor/`: offline Bootstrap, Bootstrap Icons, Ionicons (1300 plus SVGs). Only Monaco uses CDN.
* `src/data/tools-manifest.json`: binary manifest with repos and update flags.

### 3.2 Data flow to replicate

```
pick or drop -> add to batch or image queue -> persist queue
  -> probeMedia(get_media_info) -> metadata row plus preview plus trim sync
  -> form change -> buildCommandForTool -> command preview plus estimates plus save params
  -> Execute (single vs batch vs kit vs ytdlp)
  -> spawn job, stream ffmpeg-progress/log/finished
  -> update progress/log -> on finish toast plus notification plus reveal
  -> mark queue item done, persist, filter done on reload
```

Settings and hardware flow: `get_hardware_info -> setDetectedHardware -> getResolvedHwaccel/mapHardwareEncoder` affects every command. Theme and tools managers are independent.

### 3.3 Persistence map

Desktop `localStorage` namespace `anedikit:*` is fully specified in `docs/localstorage_keys.md`. Android mapping:

* `anedikit:settings` -> DataStore Preferences plus Room for complex objects. Includes output dir, overwrite prompt, notifications, animations, user kits flag, hw accel, threads, defaults, yt-dlp globals, bin paths.
* `anedikit:settings:active_tool`, `last_input_file`, `last_ytdlp_out_dir`, `last_image_ai_out_dir`, `active_kit`, `active_kit_tab:<id>`, `script_theme`, `theme` -> DataStore.
* `anedikit:tools:batch:queue [{path,name,status}]` and `anedikit:tools:image_ai:queue [{path,name,status,resultPath}]` -> Room tables `batch_items`, `image_items` with statuses queued/running/done/error. Filter done on load like desktop.
* `anedikit:tools:params:<toolId> {moduleId, properties[{id,value,type}], updatedAt}` for 23 tools plus `kit_<id>` -> Room table `tool_params(tool_id, json, updated_at)` or DataStore per tool. Keep per-tool IDs stable (`cvt-container`, `comp-preset`, `trim-start`, `speed-preset`, `crop-ratio`, `stab-engine`, `norm-target`, `mute-action`, `gif-mode`, `aud-format`, `comp-aud-preset`, `merge-engine`, `custom-args`, `bg-model`, `upscale-factor`, `vec-mode`, `rest-method`, `icon-fit-mode`, `meta-action`, `dl-video-res`, etc) so desktop exports can migrate.
* `anedikit:tools:user_kits [kit definitions]` -> Room `kits` table with JSON blocks plus script plus metadata.
* `anedikit:tools:ytdlp:filename_format` -> DataStore string with same token syntax.

## 4. Backend architecture to mirror

### 4.1 Desktop backend map

All logic in `src-tauri/src/lib.rs` (2825 lines, single file). `main.rs` is 6 lines. `Cargo.toml`: tauri v2 plus protocol-asset, opener plugin, serde, rfd 0.15, base64. No tokio FFmpeg crates, everything via `std::process::Command`. Config: `tauri.conf.json` (`productName anedikit 0.2.0`, `frontendDist ../src`, single window 1100x720, CSP null, asset scope `**`), `capabilities/default.json` (core window plus opener only, file/process done natively).

Global state: `RUNNING_CHILD_PID Mutex<Option<u32>>` single-job slot, `CANCEL_REQUESTED AtomicBool`, `BINARY_PATH_CACHE`, `HARDWARE_INFO_CACHE`.

27 Tauri commands and Android equivalents:

* File dialogs: `pick_file/pick_files/pick_folder/write_temp_text_file/check_file_exists/read_image_data` (rfd, temp dir, percent-decode, base64 data URL). Android: Storage Access Framework `OpenDocument`/`OpenMultipleDocuments`/`OpenDocumentTree`, MediaStore for shared collections, `cacheDir/filesDir` for temp concat lists, `DocumentFile.exists()`, Coil/Glide for thumbs plus base64 only when needed for comparison view.
* Probing and thumbs: `get_media_info` (ffprobe JSON duration/bitrate/streams, ext fallback for audio/images), `extract_album_art` (ffmpeg mjpeg to ThumbCache/Audio hash.jpg), `extract_action_frame` (seek 15pct max 15s or 1.0s or 0, scale 640), `extract_timeline_thumbnails` (clamp 4-24 default 12, fps filter scale 160x90 crop), `extract_timeline_frame` (lazy single tile), `fetch_playlist_videos` (yt-dlp flat playlist JSON lines, extractor args, private/deleted skip). Android: `MediaMetadataRetriever` plus `ffprobe-kit` if FFmpegKit is used, Coil cache under `cacheDir/thumbCache/{audio,video,timeline}` keyed by path plus length plus mtime hash, playlist via NewPipeExtractor or app server (see section 6).
* Executors: `execute_ffmpeg(args,totalDuration)`, `execute_ytdlp(args)`, `execute_image_ai(task,params)` all return immediately and emit events via background threads with two reader threads (stdout plus stderr). Android: single `WorkManager` plus `ForegroundService` job slot with `CoroutineScope(IO)`, same immediate-return plus Flow/StateFlow updates.
* Control: `cancel_ffmpeg/cancel_job` (`taskkill /F /T` or `kill -9`), `is_job_active`, `force_exit_app`. Android: `job.cancel()` plus `FFmpegKit.cancel()` plus `process.destroy()`, `WorkManager.cancelWorkById()`.
* Env and tools: `check_tool_versions` (parallel yt-dlp/deno/ffmpeg/ffprobe version parses, python hardcoded Available), `update_tool` (yt-dlp `-U`, deno curl plus tar to shared bin, ffmpeg BtbN zip plus ffbinaries fallback, clear cache), `open_binaries_folder` (explorer shared bin), `get_hardware_info` (registry CPU/GPU classify to cuda/qsv/amf/cpu, cached). Android: PackageManager version checks, in-app downloader to `filesDir/bin` with checksum, `MediaCodecList` capability probe for AVC/HEVC/AV1 encoders instead of registry.
* OS integration: `open_file` (`cmd start`), `show_in_folder` (`explorer /select` with ancestor fallback), `send_system_notification` (WinRT PowerShell toast), `set_decorations`. Android: `FileProvider` plus `ACTION_VIEW`, `ACTION_VIEW` on parent with `DocumentsContract`, `NotificationCompat` with channel plus progress notification, edge-to-edge theming instead of decorations.

Binary resolution order on desktop: `%LOCALAPPDATA%/ASDK/Shared/bin`, `%LOCALAPPDATA%/tauri/bin`, `C:\ffmpeg\bin`, PATH scan, literal fallback. Android equivalent: `filesDir/bin` first, then bundled native libs, then system codecs, else error with Manage Tools screen.

### 4.2 Process model details to keep

* Single global job. Starting a new execute overwrites PID slot. `is_job_active` guards navigation and close. No queue parallelism. This maps well to Android foreground service limits and thermal constraints. Keep it.
* Cooperative cancel flag checked per byte in `stream_lines` (splits on newline and carriage return, strips ANSI, skips empties). FFmpeg `-progress pipe:1` plus stderr `time=` parsing, yt-dlp `--newline --no-colors --progress --print after_move:filepath:...` with dual parsers, AI `ANEDIKIT_PROGRESS` JSON plus tqdm fallback. Keep the same three-event contract on Android: `Progress(time,eta,fps,speed,bitrate,pct,playlistItem,playlistTotal,currentTitle)`, `Log(line)`, `Finished(success,exitCode,message)`, plus `ConfirmExitRequested` when back is pressed while busy.
* All Windows commands use `CREATE_NO_WINDOW`. Android equivalent: no console windows, use `ProcessBuilder.redirectErrorStream(false)` with separate collectors, low priority background thread.
* Short tasks use blocking `output()` awaited by JS. Android: suspend functions with `Dispatchers.IO`. Long tasks use detached thread plus events. Android: `WorkManager` plus `callbackFlow`.

## 5. FFmpeg on Android

Recommended: FFmpegKit LTS for full filter parity in v1, with a gradual migration of simple ops (trim copy, merge demuxer, metadata strip) to Media3 Transformer plus `MediaMetadataRetriever` to reduce binary size and improve battery.

What changes per tool:

* Hardware accel: desktop NVENC/QSV/AMF plus `-hwaccel cuda/qsv/d3d11va` has no direct equivalent. Use `MediaCodec` encoders via `-c:v h264_mediacodec/hevc_mediacodec` where FFmpegKit build supports it, else libx264 with `preset ultrafast/superfast/veryfast` and `threads 0-4` based on `Runtime.availableProcessors()`. Probe `MediaCodecList` for `video/avc`, `video/hevc`, `video/av01` encoder support and expose as Auto/CPU/MediaCodec setting. Keep the same `getResolvedHwaccel/mapHardwareEncoder` abstraction so UI does not change.
* GIF/WebP palettegen, `scale+pad`, `setpts`, `atempo`, `loudnorm`, `deshake`, `concat demuxer/filter`, `amix` all work in FFmpegKit if the full GPL package is used. Verify package flavor includes `libwebp`, `libmp3lame`, `libopus`, `libvorbis`.
* File access: FFmpegKit cannot always read SAF `content://` URIs directly. Copy picked inputs to `cacheDir/imports/` with original basename preserved, run FFmpeg on file paths, then publish outputs via MediaStore (`Video/Images/Audio`) or SAF tree. Keep desktop `resolveDestinationPath` logic but default to `Movies/AnEdiKit` via MediaStore on Android 10 plus, with user override via `OpenDocumentTree`.
* Progress: keep parsing `-progress pipe:1` (`out_time`, `out_time_us/ms`, `fps`, `speed`, `bitrate`, `progress=continue/end`) with `pct = cur/total*100`, `eta = (total-cur)/speed` floored at 0.05. Total duration comes from probe step, same as desktop `total_duration` arg.
* Cancellation: `FFmpegKit.cancel(sessionId)` plus coroutine cancel. Show same Cancel control and confirm-exit dialog.
* Size: FFmpegKit adds roughly 20-30 MB per ABI. Ship `arm64-v8a` only for MVP, add `armeabi-v7a` later if needed. Use App Bundle splits.

## 6. Downloader on Android (hardest gap)

Desktop shells `yt-dlp` with cookies, rate limit, SponsorBlock, geo bypass, retries, extractor args, and playlist JSON parsing. None of this exists as a Gradle dependency.

Three options, in recommended order for an MVP:

1. Companion extractor library (recommended for store compliance): use NewPipeExtractor or Piped API to list formats, playlist items, subtitles, thumbnails. Download via OkHttp plus merge via FFmpegKit (`-c copy -bsf:a aac_adtstoasc` for HLS/DASH merge). Reimplement the 4 desktop views on top of this abstraction so `dl-video-res/container/embed`, `dl-audio-fmt/quality`, `dl-playlist-mode/items/autonumber`, `dl-sub-lang/fmt/auto/thumb/info` survive even though flags differ under the hood. Filename template engine (`%(title)s`, `%(id)s`, `%(ext)s`, restrict/trim) can be kept verbatim.
2. Embedded yt-dlp via Chaquopy (Python on Android): closest to desktop behavior including SponsorBlock and cookies, but heavy (Python runtime plus frequent yt-dlp updates), background limits hurt long playlists, Play policy risk for YouTube downloading. Only choose this if exact desktop parity matters more than store listing.
3. Self-hosted bridge: Android app talks to a user-run desktop or server running yt-dlp and returns direct URLs or files. Keeps app light andGap compliant, but breaks on-device promise.

Regardless of option, keep desktop UX pieces: URL card with output dir plus filename template plus edit modal, playlist Fetch with checkbox list plus sort plus toggle-all, dual progress (current item plus overall batch), global settings for cookies/rate limit/SponsorBlock/geo bypass/custom args (map cookies to WebView cookie import or app storage on mobile).

Legal note: verify Play policy and regional rules before shipping YouTube downloading. Many apps in this category ship via F-Droid or direct APK for this reason.

## 7. Image and AI on Android

Desktop `image_ai_engine.py` protocol is worth cloning: `--task --params JSON`, stdout lines `ANEDIKIT_PROGRESS` plus `ANEDIKIT_RESULT`, stderr logs. On Android replace CPython with native stacks:

* Background removal: ONNX Runtime Mobile with U2Net/ISNet/BiRefNet quantized ONNX (reuse desktop model URLs where license allows), fallback to ML Kit Selfie Segmentation for speed, plus GrabCut via OpenCV Android SDK as last resort. Keep output modes transparent/solid/blur and fake checkerboard cleaner logic.
* Upscaler: Real-ESRGAN ONNX is heavy for phones. MVP with Lanczos plus CLAHE/sharpen/denoise in OpenCV (matches desktop non-neural path), then add 2x ESRGAN-tiny ONNX as optional download in Manage Tools. Expose 2x/3x/4x plus denoise strength.
* Vectorizer, restore/denoise, icon generator, metadata cleaner: all portable to OpenCV Android plus AndroidX ExifInterface. Icon generator should add Android adaptive icon (`mipmap-anydpi`, `ic_launcher_foreground/background`) and PWA outputs alongside ICO/favicon, which fits the mobile story.
* Models storage: `filesDir/models/{bg_remover,upscaler}` mirroring desktop `%LOCALAPPDATA%/ASDK/...`, with download plus progress plus checksum in Manage Tools. Keep `replace_source` semantics (overwrite vs suffixed copy).

## 8. Kits, themes, tools manager on Android

* Kits: keep metadata plus blocks plus script model and JSON export/import. Replace Monaco with a plain code editor (or embedded WebView Monaco only on large screens). Replace Deno/Node/Python targets with FFmpegKit plus app helpers (`getDefaultOutputDir/getSettings/joinPath/splitArgs`). Sandbox with QuickJS or programmatic block-to-args compiler instead of `AsyncFunction` for safety. Keep builder features: add dropdown, batch modify, drag reorder, accordion editors, option rows, move/delete, duplicate/export.
* Themes: desktop has 10 presets plus CSS vars plus import/export `.theme.txt`. Map to Material3 dynamic color plus custom seed palettes in `ThemeManager`, persisted in DataStore. Keep the same preset names where possible for familiarity.
* Tools manager: desktop checks 4 binaries in parallel and updates via GitHub/curl/tar. Android equivalent screen lists FFmpegKit version, extractor version, ONNX models, OpenCV version with Check/Update/Reinstall, storage path display, open folder via SAF.

## 9. UI mapping

Desktop layout: fixed 280px sidebar, 56px top bar spanning full width, main workspace with morphing preview card, shared input versus URL versus image queue cards, per-tool views, execution footer.

Android mapping:

* Navigation: NavigationDrawer on tablets plus BottomNavigation or NavigationRail on phones with same 4 groups (FFmpeg, Image AI, Downloads, Kits) plus Settings. Keep tool IDs identical (`convert`, `compress`, `trim`, ...) so saved params migrate. Keep directional transitions (slide by tool order plus zoom on workspace) using Compose animation tokens matching `motion-tokens.css`.
* Shared input card: SAF picker buttons (Choose File, Add Multiple, Clear), drag-and-drop via `OnReceiveContentListener` on large screens, metadata row (duration/resolution/vcodec/acodec/size), output filename field with middle-ellipsis and exists warning, preview card with video/audio/image modes (ExoPlayer/Coil, transparency grid for alpha).
* Image queue card and URL card: direct ports with `image-ai-output-dir`, `ytdlp-url-input`, `ytdlp-output-dir`, filename template field.
* Execution footer: command preview (monospace, copy with success check animation), log console (lazy list capped at 500, color by level), linear progress plus time/ETA/FPS/speed/bitrate, playlist header `Currently processing (n of m)`, Execute/Reset/Cancel state machine (hide Execute on Settings, `Execute Kit` on kits, `Fetch` vs `Download(n)` on playlist, `Execute(n)` on batch, require 2 plus files on merge, require args on custom).
* Trimmer: dual slider with filmstrip thumbs (160x90 tiles, 4-24 count, lazy load), dimmers, selection window, playhead, tooltips, waveform canvas behind audio (peaks or synthetic fallback, DPR aware). Use ExoPlayer plus Compose Slider plus Canvas.
* Comparison and lightbox: before/after split/side/fade with drag divider, zoom/pan 0.25-5x, tuning drawer for fake transparency. Keep for image tools.
* Copy feedback, M3 switches, toasts, confirm-exit dialog: keep behaviors verbatim.

## 10. Recommended Android stack and project structure

Stack: Kotlin, Jetpack Compose Material3, Navigation Compose, Room, DataStore Preferences, WorkManager plus ForegroundService, ExoPlayer/Media3, FFmpegKit, ONNX Runtime Mobile, OpenCV Android SDK, Coil, OkHttp, NewPipeExtractor (or bridge), QuickJS or block compiler for kits, JUnit/Espresso plus screenshot tests.

Suggested packages:

```
com.anedikit.app
  MainActivity.kt, AnEdiKitApp.kt
  navigation/ (routes, toolOrder, metadata matching TOOL_METADATA)
  ui/
    shell/ (topBar, sidebar/drawer, workspace)
    components/ (inputCard, urlCard, imageQueueCard, cmdPreview, logConsole,
      progressFooter, trimmer, waveform, preview, comparison, switches, toasts)
    tools/ (one screen per toolId, shared form widgets)
    kits/ (runner, builder, editor, settings, modals)
    settings/ (settingsScreen, toolsManagerScreen, themeScreen, filenameEditor)
  engine/
    jobs/ (jobManager single-slot, jobEvents Progress/Log/Finished,
      ffmpegRunner, downloadRunner, aiRunner, cancel)
    ffmpeg/ (commandBuilders per tool mirroring commands.js,
      hwProbe via MediaCodecList, estimator mirroring updateEstimatesUI)
    downloads/ (extractor interface, playlist parser, filenameTemplate engine)
    ai/ (bgRemover, upscaler, vectorizer, restore, icons, metadata)
    media/ (probe, albumArt, actionFrame, timelineTiles, waveformPeaks)
  data/
    db/ (AppDatabase, batchItems, imageItems, toolParams, kits)
    prefs/ (settingsRepository mapping anedikit:settings keys)
    kits/ (kitRepository, blockDefinitions, templates, scriptSandbox)
  workers/ (TranscodeWorker, DownloadWorker, AiWorker, ForegroundService)
```

Keep `commandBuilders` function-for-function compatible with desktop `commands.js` and `image_commands.js` so test vectors can be shared.

## 11. MVP roadmap

Phase 0 scaffold: shell plus navigation plus settings plus DataStore plus Room plus command preview plus log plus progress UI with fake runner.

Phase 1 media core: SAF pickers, probe, preview, Convert, Extract Audio, Trim, Merge, Custom. Single-job WorkManager runner with cancel plus notifications plus MediaStore publish. This already delivers the general idea.

Phase 2 compression and polish: Compress Video/Audio with bitrate budgeting plus estimator, Speed, Aspect/Crop, Mute/Replace, GIF/Frames, Loop, Normalize, Stabilize. Timeline thumbs plus waveform plus batch queue.

Phase 3 downloads: extractor integration, 4 download views, playlist fetch plus selection, filename template editor, dual progress.

Phase 4 AI images: metadata cleaner plus icon generator plus restore/denoise (OpenCV only, no models), then background remover plus upscaler with downloadable ONNX packs.

Phase 5 kits and themes: block runner plus JSON import/export, then builder plus script editor, 10 theme presets, tools manager with model updates.

Phase 6 release hardening: ABI splits, scoped storage audit, background and battery optimization exemptions flow, Play vs F-Droid tracks, E2E tests mirroring the desktop app flows plus fixture media.

## 12. Permissions, storage, background, and size notes

* Permissions: `READ_MEDIA_VIDEO/IMAGES/AUDIO` (or `READ_EXTERNAL_STORAGE` pre-33), `POST_NOTIFICATIONS` (33 plus), `FOREGROUND_SERVICE_MEDIA_PROCESSING` plus `FOREGROUND_SERVICE_DATA_SYNC` for downloads, no broad `MANAGE_EXTERNAL_STORAGE` unless F-Droid build justifies it. Use SAF and MediaStore so most ops need no legacy storage permission.
* Scoped storage: never hardcode `C:\Videos`. Default to `Movies/AnEdiKit`, `Music/AnEdiKit`, `Pictures/AnEdiKit`, `Download/AnEdiKit` via MediaStore relative paths, plus user SAF tree override. Copy SAF inputs to cache for FFmpeg, publish outputs back, clean cache with LRU.
* Background: long encodes and playlists must run as `ForegroundService` with persistent progress notification (same fields as desktop progress payload). Use `WorkManager` expedited work for resumable batches. Handle Doze by warning on battery optimization and by chunking playlists per item.
* Thermal and battery: keep single-job model, default threads 2-4 on phones, ultrafast/superfast presets first, warn on 4K plus AV1 on low RAM devices (check `ActivityManager.memoryClass`).
* Size: FFmpegKit full plus ONNX plus OpenCV can exceed 100 MB installed. Mitigate with App Bundle ABI splits, optional model downloads (do not bundle all rembg weights), and Media3 fast paths for copy-only ops.
* Tests and fixtures: mirror desktop `test/` media (mp4/mkv/webm/mov/avi, mp3/wav/flac/m4a/ogg/opus/aac, jpg/png/webp/bmp/tiff/svg/gif) with `androidTest` assets plus a smoke test asserting tool nav exists (desktop asserts `#tool-nav`).

## 13. Appendix: porting checklists

Command parity checklist per FFmpeg tool: inputs accepted, params preserved, FFmpeg template identical modulo hw accel and paths, output suffix identical, estimator formula identical, edge cases (copy hides CRF/preset, lossless hides bitrate, GIF/WebP conditional UI, merge needs 2 files, custom needs args) preserved.

Event parity: `ffmpeg-progress` fields (time/eta/fps/speed/bitrate/pct/playlistItem/playlistTotal/currentTitle), `ffmpeg-log` per line, `ffmpeg-finished` terminal, `confirm-exit-requested` on back while busy.

Tools manager parity: local versions, latest GitHub releases where applicable, Install/Update/Reinstall states, exec cards plus manage rows, download plus extract progress.

Docs to keep alongside this file: `docs/introduction.md` (philosophy and suites), `docs/localstorage_keys.md` (exact param IDs for Room migration), `src/data/tools-manifest.json` (binary versions), `src/js/commands.js` plus `image_commands.js` (source of truth for templates), `src-tauri/src/lib.rs` progress parsers (source of truth for job events).
