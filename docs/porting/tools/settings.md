# Settings & Application Preferences (`settings`)

## 1. Tool Purpose
Centralized configuration center for AnEdiKit. Manages global output paths, hardware acceleration, encoder threads, media defaults, yt-dlp scraping parameters, external tool binaries (FFmpeg, yt-dlp, Deno), and theme customization.

## 2. Settings Sections and Fields (`src/js/app_settings.js`, `src/js/storage.js`)

### Appearance & Interface
| Setting Key | Label | Type | Default | Description |
|---|---|---|---|---|
| `enableNotifications` | Task Notifications | Switch | `true` | Show desktop OS notification on job finish |
| `disableAnimations` | Reduce Motion | Switch | `false` | Disable animations, transitions, and zoom effects |
| `showMediaPreview` | Show Media Preview | Switch | `true` | Display 16:9 video / 1:1 audio card beside input |
| `enableUserKits` | User Kits | Switch | `false` | Enable scriptable modules in sidebar |
| `useSystemTitlebar` | System Title Bar | Switch | `false` | Calls `window::set_decorations` |
| `hideScrollbarsOnHover` | Hide Scrollbars | Switch | `false` | CSS class `hide-scrollbars-on-hover` |
| Theme Customizer | Theme Modal | Button | - | Opens Theme Customizer Dialog |

### Storage Defaults
| Setting Key | Label | Type | Default | Description |
|---|---|---|---|---|
| `outputDir` | Default Output Directory | Folder Path | `"C:\\Users\\User\\Videos"` | Selected via `system::pick_folder` |
| `promptOverwrite` | Overwrite Prompt | Switch | `true` | Confirm before overwriting existing files |

### Hardware Acceleration & Performance
| Setting Key | Label | Type | Default | Description |
|---|---|---|---|---|
| `hwAccel` | Acceleration Engine | Select | `"auto"` | `auto`, `nvenc` (NVIDIA), `qsv` (Intel Quick Sync), `amf` (AMD), `d3d11va`, `cpu` (None) |
| `threads` | Encoding Threads | Select | `"0"` | `0` (Auto / all cores), `1`, `2`, `4`, `8`, `16`, `32` |
| Hardware Detection | Detected Hardware | Card | - | Reads CPU, GPU specs via `system::get_hardware_info` |

### Media Defaults
| Setting Key | Label | Type | Default | Description |
|---|---|---|---|---|
| `defVCodec` | Default Video Codec | Select | `"libx264"` | `libx264`, `libx265`, `libvpx-vp9`, `libsvtav1` |
| `defSpeed` | Default Encoding Speed | Select | `"medium"` | `ultrafast`, `fast`, `medium`, `slow` |
| `defAFmt` | Default Audio Format | Select | `"mp3"` | `mp3`, `m4a`, `flac`, `wav`, `opus`, `ogg` |
| `defABitrate` | Default Audio Bitrate | Select | `"256k"` | `320k`, `256k`, `192k`, `128k`, `96k`, `64k` |

### yt-dlp Advanced Preferences
| Setting Key | Label | Type | Default | Description |
|---|---|---|---|---|
| `ytdlpCookies` | Browser Cookies | Select | `"none"` | `none`, `chrome`, `firefox`, `edge`, `brave`, `opera`, `vivaldi` |
| `ytdlpRateLimit` | Download Rate Limit | Select | `"none"` | `none`, `500K`, `1M`, `2M`, `5M`, `10M` |
| `ytdlpSponsorblock` | SponsorBlock | Switch | `false` | Adds `--sponsorblock-remove all` |
| `ytdlpGeoBypass` | Geo-Bypass | Switch | `true` | Adds `--geo-bypass` |
| `ytdlpAutoPaste` | Auto-Paste URLs | Switch | `true` | Reads clipboard on window focus for video links |
| `ytdlpAutoFixUrl` | Auto-Clean URLs | Switch | `true` | Strips tracking and playlist parameters |
| `ytdlpFilenameFormat` | Filename Template | Text | `"%(title)s [%(id)s].%(ext)s"` | Template with token editor modal |
| `ytdlpCustomArgs` | Custom Arguments | Text | `""` | User CLI flags passed to every yt-dlp run |

### External Tools & Binaries (`src/js/tools_manager.js`)
| Binary | Version Command | Manage Actions |
|---|---|---|
| FFmpeg | `check_tool_versions()` | Status badge, Download / Update via curl, Delete |
| FFprobe | `check_tool_versions()` | Status badge, Download / Update via curl, Delete |
| yt-dlp | `check_tool_versions()` | Status badge, Download / Update via curl, Delete |
| Deno | `check_tool_versions()` | Status badge, Download / Update via curl, Delete |

Buttons:
- "Manage Tools...": opens `#manage-tools-modal` with download progress bars and cancel buttons.
- "Open Binaries Folder": calls `tools::open_binaries_folder()`.

## 3. Rust Commands and Events
- `system::get_hardware_info()` -> `HardwareInfo`
- `system::probe_hardware_acceleration({ engine })` -> `boolean`
- `system::pick_folder({ defaultPath })` -> `string`
- `tools::check_tool_versions()` -> `Record<string, string>`
- `tools::update_tool({ toolName })` -> `string`
- `tools::cancel_tool_update()` -> `string`
- `tools::delete_tool({ toolName })`
- `tools::open_binaries_folder()`
- `window::set_decorations({ decorations })`
- Events: `tool_download_progress`, `tool_extraction_progress`.

## 4. Edge Cases
- When updating FFmpeg, the zip file is extracted and binaries moved while reporting extraction progress steps.
- Cancellation during curl download deletes the partial `.tmp` file immediately.

## 5. DOM Decoupling for React
- Create `useSettingsStore` (Zustand) with direct schema validation.
- Decouple Binaries Manager into a standalone modal dialog `<ManageToolsDialog>`.
