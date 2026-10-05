# Styling, Design Tokens, and shadcn Theme Mapping

## 1. Overview of Design Tokens

The current AnEdiKit frontend utilizes a bespoke semantic token system layered over Bootstrap 5.3 variables (`src/css/design-tokens.css`) and transitions (`src/css/motion-tokens.css`). 

When migrating to Tailwind CSS and shadcn/ui, these CSS variables are mapped into Tailwind's theme configuration and shadcn's standard design token dictionary (`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`).

## 2. Token Mapping Matrix

### Surfaces and Backgrounds
| AnEdiKit Token | Current Value | shadcn / Tailwind Mapping | Tailwind Class |
|---|---|---|---|
| `--aek-surface-primary` | `var(--bs-body-bg)` (`#212529`) | `--background` | `bg-background` |
| `--aek-surface-secondary` | `var(--bs-secondary-bg)` (`#2b3035`) | `--card` / `--muted` | `bg-card` / `bg-muted` |
| `--aek-surface-tertiary` | `var(--bs-tertiary-bg)` (`#343a40`) | `--accent` / `--secondary` | `bg-accent` |
| `--aek-surface-elevated` | Modal / popup surface | `--popover` | `bg-popover` |
| `--aek-surface-overlay` | `rgba(0, 0, 0, 0.45)` | `--overlay` | `bg-black/45` |
| `--aek-canvas-bg` | `#0a0a0a` | `--canvas` | `bg-zinc-950` |

### Typography and Text Colors
| AnEdiKit Token | Current Value | shadcn / Tailwind Mapping | Tailwind Class |
|---|---|---|---|
| `--aek-text-primary` | `var(--bs-body-color)` (`#dee2e6`) | `--foreground` | `text-foreground` |
| `--aek-text-secondary` | `var(--bs-secondary-color)` (`#adb5bd`) | `--muted-foreground` | `text-muted-foreground` |
| `--aek-text-muted` | `var(--bs-tertiary-color)` (`#6c757d`) | `--muted-foreground` | `text-muted-foreground/80` |
| `--aek-text-accent` | `var(--bs-primary)` (`#0d6efd`) | `--primary` | `text-primary` |
| `--aek-text-inverse` | `#ffffff` | `--primary-foreground` | `text-primary-foreground` |

### Semantic Accents
| AnEdiKit Token | Current Value | shadcn / Tailwind Mapping | Tailwind Class |
|---|---|---|---|
| `--aek-accent-primary` | `#0d6efd` | `--primary` | `bg-primary` / `text-primary` |
| `--aek-accent-success` | `#198754` | `--success` | `bg-emerald-600` / `text-emerald-500` |
| `--aek-accent-danger` | `#dc3545` | `--destructive` | `bg-destructive` / `text-destructive` |
| `--aek-accent-warning` | `#ffc107` | `--warning` | `bg-amber-500` / `text-amber-400` |
| `--aek-border` | `var(--bs-border-color)` (`#495057`) | `--border` | `border-border` |
| `--aek-border-strong` | `var(--bs-border-color-translucent)` | `--border` | `border-border/80` |

### Spacing Scale
| AnEdiKit Space Token | Pixels | Tailwind Utility |
|---|---|---|
| `--aek-space-1` | 4px | `p-1` / `gap-1` |
| `--aek-space-2` | 8px | `p-2` / `gap-2` |
| `--aek-space-3` | 12px | `p-3` / `gap-3` |
| `--aek-space-4` | 16px | `p-4` / `gap-4` |
| `--aek-space-5` | 20px | `p-5` / `gap-5` |
| `--aek-space-6` | 24px | `p-6` / `gap-6` |
| `--aek-space-8` | 32px | `p-8` / `gap-8` |

### Font Size Scale
| AnEdiKit Token | Value | Tailwind Utility | Intended Usage |
|---|---|---|---|
| `--aek-text-xs` | 0.72rem | `text-[0.72rem]` / `text-xs` | Path readouts, log entries, badge captions |
| `--aek-text-sm` | 0.75rem | `text-xs` | Secondary labels, descriptions |
| `--aek-text-base` | 0.875rem | `text-sm` | Default button, nav-link, input text |
| `--aek-text-md` | 1rem | `text-base` | Card titles, section headers |
| `--aek-text-lg` | 1.15rem | `text-lg` | View titles |
| `--aek-text-xl` | 1.25rem | `text-xl` | Hero and modal titles |

### Border Radii
| AnEdiKit Token | Value | shadcn Variable | Tailwind Class |
|---|---|---|---|
| `--aek-radius-sm` | 4px | `calc(var(--radius) - 4px)` | `rounded-sm` |
| `--aek-radius-md` | 6px | `calc(var(--radius) - 2px)` | `rounded-md` |
| `--aek-radius-lg` | 8px | `var(--radius)` (default: 8px) | `rounded-lg` |

## 3. Motion and Transition Tokens (`src/css/motion-tokens.css`)

Tailwind transition configuration maps the application's timing functions:
```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      transitionDuration: {
        stagger: '40ms',
        micro: '80ms',
        quick: '150ms',
        fast: '250ms',
        medium: '350ms',
        slow: '400ms',
      },
      transitionTimingFunction: {
        'smooth-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'apple': 'cubic-bezier(0.32, 0.72, 0, 1)',
        'bounce-soft': 'cubic-bezier(0.34, 1.36, 0.64, 1)',
      },
    },
  },
};
```

## 4. WebView2 Frosted Glass & Backdrop Blur Rules

Tauri on Windows renders through Microsoft Edge WebView2. The following hard constraints from `src/GEMINI.md` must be preserved:

1. Never Nest `backdrop-filter`: A blurred ancestor element blinds descendant blurs (turning children flat). Modals must mount as direct children of the DOM root (`document.body`) using React Portals (`@radix-ui/react-portal`).
2. Translucency in Alpha, Never in Opacity: Elements using `backdrop-filter` must have `opacity: 1` and carry translucency solely in their `background-color` (e.g. `rgba(33, 37, 41, 0.75)`). Setting `opacity < 1` on an element with `backdrop-filter` disables sampling in Chromium.
3. Frosted Dialogs and 3D Perspective: Chromium disables `backdrop-filter` inside 3D rendering contexts. If a modal dialog uses 3D entrance transforms (`perspective` or `translateZ`), the transform must be cleared (`transform: none`, `will-change: auto`) once the modal has settled into its open state.
4. Blur Gate Variable:
   - When blur is disabled in Settings: `--anedikit-blur-enabled: 0`.
   - When enabled: `--anedikit-blur-enabled: 1`.
   - All frosted glass declarations must use:
     ```css
     backdrop-filter: blur(calc(var(--anedikit-blur-radius, 16px) * var(--anedikit-blur-enabled, 1))) saturate(var(--anedikit-blur-saturate, 140%));
     ```

## 5. Iconography Migration (Ionicons to Lucide React)

AnEdiKit uses Ionicons (`<ion-icon name="...">`). In React + shadcn, these are replaced with Lucide React:

| Ionicons Name | Lucide React Component | Usage |
|---|---|---|
| `film-outline` | `Film` | Convert Video, Video Files |
| `archive-outline` | `Archive` | Compress Video / Audio |
| `cut-outline` | `Scissors` | Trim and Cut Media |
| `speedometer-outline` | `Gauge` / `FastForward` | Speed & Motion, Optimize PDF |
| `crop-outline` | `Crop` | Aspect & Crop |
| `videocam-outline` | `Video` | Video Stabilization |
| `repeat-outline` | `Repeat` | Loop to Duration |
| `options-outline` | `Sliders` | Normalize Loudness |
| `volume-mute-outline` | `VolumeX` | Mute or Replace Audio |
| `images-outline` | `Images` | GIF and Frames |
| `musical-notes-outline` | `Music` | Extract Audio, Audio Tags |
| `library-outline` | `Layers` | Merge and Concat |
| `terminal-outline` | `Terminal` | Custom FFmpeg Command |
| `person-circle-outline` | `UserCheck` / `Sparkles` | Background Remover |
| `scan-outline` | `Maximize2` | AI Upscaler |
| `shapes-outline` | `Shapes` | Image Vectorizer |
| `sparkles-outline` | `Sparkles` | Restore & Denoise, AI |
| `apps-outline` | `LayoutGrid` | Icon Generator, Dashboard |
| `shield-checkmark-outline` | `ShieldCheck` | Metadata Cleaner, PDF Security |
| `file-tray-stacked-outline`| `FolderArchive` | Organize PDF |
| `download-outline` | `Download` | Download Video |
| `musical-note-outline` | `Music2` | Download Audio |
| `list-outline` | `ListFilter` | Download Playlist |
| `settings-outline` | `Settings` | Settings |
| `folder-open-outline` | `FolderOpen` | Browse Folder / File |
| `copy-outline` | `Copy` | Copy Command / Logs |
| `trash-outline` | `Trash2` | Delete / Clear Queue |
