# NekoAI Screen Tools — Implementation Plan

> **Feature set:** NekoCapture (screenshot suite) + NekoAnnotate (screen drawing overlay)  
> **Inspired by:** Windows PowerToys ZoomIt (Draw mode, screenshot tools)  
> **Target versions:** v0.5 (NekoCapture) · v0.6 (NekoAnnotate)

---

## Overview

Two integrated features that turn NekoAI into a lightweight screen productivity tool:

- **NekoCapture** — native screenshot capture with a customizable metadata footer, configurable borders, and clipboard/file export.
- **NekoAnnotate** — a full-screen transparent drawing overlay (pen, shapes, arrows, text) that activates via hotkey, similar to ZoomIt's Draw mode.

Both are accessible from the NekoAI tray menu, the right-click context menu, and global hotkeys.

---

## User Stories

| As a…      | I want to…                                                   | So that…                                                  |
| ---------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Developer  | Take a screenshot with my username + timestamp in the footer | I can track which machine/moment generated a capture      |
| Reviewer   | Annotate a screen with arrows and text                       | I can explain issues to teammates without leaving my desk |
| Any user   | Add a comment to a screenshot at capture time                | Context is baked into the image, not a separate file      |
| Designer   | Customize border color and thickness on captures             | Screenshots match my team's visual style                  |
| Power user | Assign hotkeys for capture modes                             | I never leave my workflow to take a screenshot            |

---

## Architecture Changes

### New files

```
src-tauri/src/
└── screen_capture.rs       # Screenshot capture + image compositing (Rust)

src/
├── components/
│   ├── DrawingOverlay.tsx  # Full-screen canvas with drawing tools
│   ├── ScreenshotPreview.tsx  # Post-capture preview with footer/border editor
│   └── ScreenshotSettings.tsx # Default config for footer fields + borders
├── hooks/
│   ├── useDrawingTools.ts  # Canvas state, tool selection, undo/redo
│   └── useScreenCapture.ts # IPC wrappers + region selection logic
└── types/
    └── screen-tools.ts     # Shared types for capture config, drawing tools
```

### Modified files

| File                   | Change                                                       |
| ---------------------- | ------------------------------------------------------------ |
| `src-tauri/src/lib.rs` | Register new Tauri commands + drawing overlay window builder |
| `src-tauri/Cargo.toml` | Add `image`, `chrono`, `xcap`/`screenshots`, `arboard`       |
| `tauri.conf.json`      | Declare `drawing-overlay` window (hidden by default)         |
| `src/PanelWindow.tsx`  | Add "Screenshot" and "Draw" entries to the tray/context menu |
| `src/store/index.ts`   | Add `screenshotConfig` and `drawingState` slices             |

---

## Phase 1 — NekoCapture (v0.5)

### 1.1 Rust backend (`screen_capture.rs`)

```rust
// Capture modes
pub enum CaptureMode {
    Fullscreen,         // entire primary monitor
    ActiveWindow,       // focused HWND via desktop_monitor.rs
    Region { x: i32, y: i32, width: u32, height: u32 },
}

// Footer fields (all optional)
pub struct FooterConfig {
    pub show_username: bool,        // COMPUTERNAME\USERNAME
    pub show_datetime: bool,        // configurable format
    pub show_app_name: bool,        // active app at capture time
    pub show_comment: bool,
    pub comment: String,
    pub background_color: [u8; 3],  // RGB
    pub text_color: [u8; 3],
    pub font_size: u8,              // 10–24 pt
    pub logo: bool,                 // small NekoAI cat icon
}

// Border config
pub struct BorderConfig {
    pub enabled: bool,
    pub color: [u8; 3],
    pub thickness: u8,              // 0–20 px
    pub rounded_corners: u8,        // corner radius 0–16 px
    pub shadow: bool,
}
```

**New Tauri commands (all registered in `lib.rs`):**

```rust
#[tauri::command]
fn capture_screenshot(mode: CaptureMode, window: Window) -> Result<String, String>
// Returns base64-encoded PNG; opens preview window

#[tauri::command]
fn apply_footer_and_border(
    image_b64: String,
    footer: FooterConfig,
    border: BorderConfig,
) -> Result<String, String>
// Returns composited PNG as base64

#[tauri::command]
fn save_screenshot_to_file(image_b64: String, path: String) -> Result<(), String>

#[tauri::command]
fn copy_screenshot_to_clipboard(image_b64: String) -> Result<(), String>

#[tauri::command]
fn get_capture_metadata() -> CaptureMetadata
// Returns { username, computername, datetime, active_app }
```

**Crate additions (`Cargo.toml`):**

```toml
image = "0.25"          # image compositing (footer, border)
imageproc = "0.25"      # text rendering on images
rusttype = "0.9"        # font rendering
chrono = { version = "0.4", features = ["serde"] }
arboard = "3"           # cross-platform clipboard
xcap = "0.2"            # cross-platform screen capture
```

### 1.2 Footer structure

```
┌────────────────────────────────────────────────────────────┐
│                    [Screenshot content]                     │
├────────────────────────────────────────────────────────────┤
│  🐱  DESKTOP-PC\johndoe   2026-04-21 14:32   VS Code 1.88 │
│      "Fix the off-by-one in the pagination component"       │
└────────────────────────────────────────────────────────────┘
```

- Footer height auto-adjusts based on which fields are enabled (min 28 px, max 72 px).
- Each field is individually toggleable in `ScreenshotSettings.tsx` with live preview.
- Comment is entered in a small overlay prompt at capture time (dismissable, ESC to skip).

### 1.3 Border options

| Property      | Range   | Default                 |
| ------------- | ------- | ----------------------- |
| Enabled       | on/off  | off                     |
| Color         | any hex | `#5B8DEE` (NekoAI blue) |
| Thickness     | 0–20 px | 3 px                    |
| Corner radius | 0–16 px | 4 px                    |
| Drop shadow   | on/off  | off                     |

### 1.4 Capture modes & hotkeys

| Mode          | Default hotkey | Description                            |
| ------------- | -------------- | -------------------------------------- |
| Fullscreen    | `Ctrl+Shift+F` | Entire primary monitor                 |
| Active window | `Ctrl+Shift+W` | Current focused window                 |
| Region select | `Ctrl+Shift+R` | Drag to select area (crosshair cursor) |

Hotkeys are configurable in Settings → Screen Tools.

### 1.5 Save options

After capture, the preview window (`ScreenshotPreview.tsx`) offers:

- **Copy to clipboard** — instant, no dialog
- **Save as PNG** — file picker, default path `~/Pictures/NekoAI/`
- **Save as JPEG** — with quality slider (50–100)
- **Annotate** — opens NekoAnnotate overlay with the screenshot as background (v0.6 bridge)

### 1.6 Frontend components

**`ScreenshotPreview.tsx`**

- Opens in a new `200×auto` panel (or a dedicated small window)
- Shows the captured image thumbnail
- Live controls for footer fields (checkboxes) + border sliders
- Comment text field
- Action buttons: Copy / Save PNG / Save JPEG / Annotate / Discard

**`ScreenshotSettings.tsx`** (inside SettingsPanel)

- Default footer field toggles
- Default border settings
- Hotkey remapping
- Default save path

**`useScreenCapture.ts`**

```ts
interface UseScreenCapture {
  capture: (mode: CaptureMode) => Promise<CaptureResult>
  startRegionSelect: () => Promise<Region>
  applyMetadata: (image: string, config: FooterConfig, border: BorderConfig) => Promise<string>
  saveToFile: (image: string, path: string) => Promise<void>
  copyToClipboard: (image: string) => Promise<void>
}
```

---

## Phase 2 — NekoAnnotate (v0.6)

### 2.1 Drawing overlay window

A second Tauri webview window, created dynamically (not declared statically in `tauri.conf.json` to keep startup cost at zero):

```rust
// In lib.rs, when user triggers Draw mode:
let overlay = WebviewWindowBuilder::new(&app, "drawing-overlay", WebviewUrl::App("draw.html".into()))
    .fullscreen(true)
    .transparent(true)
    .always_on_top(true)
    .decorations(false)
    .skip_taskbar(true)
    .build()?;
```

The overlay captures all mouse/keyboard events when active. A dedicated Vite entry point (`draw.html` → `src/draw-main.tsx`) keeps the drawing canvas isolated from the pet window's React tree.

### 2.2 Drawing tools

| Tool        | Icon | Shortcut | Description                              |
| ----------- | ---- | -------- | ---------------------------------------- |
| Pen         | ✏️   | `P`      | Freehand strokes                         |
| Line        | /    | `L`      | Straight line, snap to 15° with Shift    |
| Rectangle   | □    | `R`      | Hollow rect; filled with Alt             |
| Ellipse     | ○    | `E`      | Hollow ellipse; circle with Shift        |
| Arrow       | →    | `A`      | Line with arrowhead                      |
| Text        | T    | `T`      | Click to place, type, confirm with Enter |
| Highlighter | 🖊   | `H`      | Semi-transparent wide stroke             |
| Eraser      | ⌫    | `X`      | Erase drawn elements                     |

**Toolbar properties (always visible):**

- Color picker (preset palette + custom hex)
- Stroke width: 1, 2, 4, 6, 8, 12 px
- Opacity: 20–100%
- Undo (`Ctrl+Z`) / Redo (`Ctrl+Y`)
- Clear all (`Ctrl+Shift+X`)

### 2.3 Activation flow

```
User presses Ctrl+Shift+D
       │
       ▼
Rust opens drawing-overlay window (fullscreen, transparent)
       │
       ▼
Overlay captures all pointer + keyboard events
       │
       ├── User draws, types, annotates freely
       │
       ├── Ctrl+Shift+S → captures overlay + underlying screen → NekoCapture preview
       │
       └── Escape / Ctrl+Shift+D again → closes overlay, clears canvas
```

### 2.4 `DrawingOverlay.tsx` architecture

```tsx
// Core drawing loop
const canvasRef = useRef<HTMLCanvasElement>(null)
const { tool, color, strokeWidth } = useDrawingTools()

// History (undo/redo)
const [history, setHistory] = useState<ImageData[]>([])
const [historyIndex, setHistoryIndex] = useState(-1)

// Render loop uses requestAnimationFrame for smooth strokes
// All elements stored as a list of DrawCommand objects for undo precision
```

**`DrawCommand` type:**

```ts
type DrawCommand =
  | { type: 'stroke'; points: Point[]; color: string; width: number; opacity: number }
  | { type: 'line'; start: Point; end: Point; color: string; width: number }
  | { type: 'rect'; rect: Rect; color: string; width: number; filled: boolean }
  | { type: 'ellipse'; center: Point; rx: number; ry: number; color: string; width: number }
  | { type: 'arrow'; start: Point; end: Point; color: string; width: number }
  | { type: 'text'; position: Point; text: string; color: string; fontSize: number }
  | { type: 'highlight'; points: Point[]; color: string; opacity: number }
```

Undo/redo operates on this command list, re-rendering from scratch each time — clean and correct.

### 2.5 Screenshot with annotations

When the user captures while the overlay is open:

1. Rust captures the screen contents _below_ the overlay using `xcap`.
2. The frontend serializes the `DrawCommand[]` list and sends it to Rust.
3. Rust re-renders commands onto the captured image using `imageproc`.
4. Result is opened in `ScreenshotPreview.tsx` for footer/border editing.

This produces a "flat" annotated image without the canvas transparency issues.

---

## Settings Panel Integration

New tab in `SettingsPanel.tsx`: **Screen Tools**

```
[ Screenshot ]
  Capture hotkeys: [Ctrl+Shift+F] fullscreen  [Ctrl+Shift+W] window  [Ctrl+Shift+R] region

  Footer defaults:
    [✓] Show username       [✓] Show date/time
    [✓] Show app name       [ ] Show NekoAI logo
    Date format: [YYYY-MM-DD HH:mm ▾]
    Font size: [12 ▾]  Background: [████]  Text: [████]

  Border defaults:
    [ ] Enable border  Color: [████]  Thickness: [3px]  Corners: [4px]  [ ] Shadow

  Default save path: [~/Pictures/NekoAI/        ] [Browse]

[ Drawing Overlay ]
  Activate hotkey: [Ctrl+Shift+D]
  Default tool: [Pen ▾]
  Default color: [████]
  Default stroke width: [4px]
  [ ] Show toolbar on activation
```

---

## Tray & Context Menu Additions

**Right-click pet context menu** (new entries after "Settings"):

```
─────────────────
📷 Screenshot
    ├── Full Screen        Ctrl+Shift+F
    ├── Active Window      Ctrl+Shift+W
    └── Select Region      Ctrl+Shift+R
✏️ Draw on Screen          Ctrl+Shift+D
─────────────────
```

**System tray menu** (same entries added before "Quit"):

```
📷 Screenshot ▶
✏️ Draw on Screen
```

---

## SQLite Schema Additions

```sql
-- Screenshot history (last 50)
CREATE TABLE IF NOT EXISTS screenshot_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at TEXT    NOT NULL,
    file_path   TEXT,               -- null if only copied to clipboard
    mode        TEXT    NOT NULL,   -- 'fullscreen' | 'window' | 'region'
    comment     TEXT,
    has_footer  INTEGER NOT NULL DEFAULT 0,
    has_border  INTEGER NOT NULL DEFAULT 0,
    has_drawing INTEGER NOT NULL DEFAULT 0
);

-- Screenshot settings (single row, upserted)
CREATE TABLE IF NOT EXISTS screenshot_config (
    id                  INTEGER PRIMARY KEY DEFAULT 1,
    footer_username     INTEGER NOT NULL DEFAULT 1,
    footer_datetime     INTEGER NOT NULL DEFAULT 1,
    footer_app          INTEGER NOT NULL DEFAULT 1,
    footer_logo         INTEGER NOT NULL DEFAULT 0,
    footer_bg_color     TEXT    NOT NULL DEFAULT '#1a1a2e',
    footer_text_color   TEXT    NOT NULL DEFAULT '#e0e0e0',
    footer_font_size    INTEGER NOT NULL DEFAULT 12,
    footer_date_format  TEXT    NOT NULL DEFAULT 'YYYY-MM-DD HH:mm',
    border_enabled      INTEGER NOT NULL DEFAULT 0,
    border_color        TEXT    NOT NULL DEFAULT '#5B8DEE',
    border_thickness    INTEGER NOT NULL DEFAULT 3,
    border_radius       INTEGER NOT NULL DEFAULT 4,
    border_shadow       INTEGER NOT NULL DEFAULT 0,
    save_path           TEXT,
    hotkey_fullscreen   TEXT    NOT NULL DEFAULT 'ctrl+shift+f',
    hotkey_window       TEXT    NOT NULL DEFAULT 'ctrl+shift+w',
    hotkey_region       TEXT    NOT NULL DEFAULT 'ctrl+shift+r',
    hotkey_draw         TEXT    NOT NULL DEFAULT 'ctrl+shift+d'
);
```

---

## Dependencies Summary

### Rust (Cargo.toml)

```toml
image = "0.25"
imageproc = "0.25"
ab_glyph = "0.2"         # font rendering (replaces rusttype, actively maintained)
chrono = { version = "0.4", features = ["serde"] }
arboard = "3"            # cross-platform clipboard (image + text)
xcap = "0.2"             # cross-platform screen capture
tauri-plugin-global-shortcut = "2"  # global hotkeys
```

### npm (package.json)

No new frontend dependencies needed — drawing is done with native Canvas API.

---

## Implementation Order (within each version)

### v0.5 (NekoCapture)

1. Add `screen_capture.rs` with fullscreen capture + footer compositing
2. Add Tauri commands in `lib.rs`
3. `ScreenshotPreview.tsx` + `useScreenCapture.ts`
4. SQLite schema migration for `screenshot_config`
5. Settings panel tab (Screen Tools → Screenshot section)
6. Context menu + tray additions
7. Hotkey registration via `tauri-plugin-global-shortcut`
8. Region-select mode (crosshair cursor, rubber-band selection)
9. JPEG export + quality slider

### v0.6 (NekoAnnotate)

1. Dynamic window creation in `lib.rs` (`WebviewWindowBuilder` for overlay)
2. Separate Vite entry: `draw.html` + `src/draw-main.tsx`
3. `DrawingOverlay.tsx` with pen + undo/redo (foundational tools first)
4. Extend with line, rect, ellipse, arrow, text, highlighter
5. Toolbar component with color picker + stroke width
6. Overlay → screenshot export (capture + re-render `DrawCommand[]` onto image)
7. Keyboard shortcut activation/deactivation
8. Settings panel tab (Screen Tools → Drawing section)
9. Tray/context menu entries

---

## Non-Goals (out of scope for these versions)

- Video/GIF recording of screen
- OCR on screenshots
- Cloud sync or screenshot sharing service
- Zoom/magnification (a separate ZoomIt feature, not requested)
- Multi-monitor support (v1.0 scope)

---

## Future Enhancements (post-v0.6)

- **NekoAI integration**: "Neko, annotate this" triggers Draw mode; after capture, Neko can describe the screenshot via AI vision.
- **Template footers**: saved footer presets (e.g., "Work review", "Bug report").
- **Stamp tools**: pre-made emoji/icon stamps for quick annotation.
- **Screenshot quick-actions**: right-click a saved screenshot from history to re-open, re-annotate, or share.
- **Blur tool**: redact sensitive information before sharing.
