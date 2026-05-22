// Tauri v2's menu/tray API passes &T where T is a dyn trait object in slice
// literals (e.g. &[&show_hide, ...]). A newer Clippy version flags these as
// needless borrows; suppressed here until Tauri's API removes the double-ref.
#![allow(clippy::needless_borrows_for_generic_args)]

use serde::Serialize;
use std::sync::mpsc;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent,
};

mod cursor_tracker;
mod desktop_monitor;
mod storage;
use storage::{AIConfig, StoredMessage};

/// Wraps the shutdown sender for the notification monitor thread so it can be
/// signalled from the Tauri RunEvent::Exit handler. The Option lets the
/// handler `take()` the sender exactly once.
struct NotificationShutdown(Mutex<Option<mpsc::Sender<()>>>);

/// Holds the optional evdev cursor tracker. `Some` only on a Linux Wayland
/// session with a readable `/dev/input` mouse device (see cursor_tracker.rs);
/// `None` everywhere else, where the native OS / X11 cursor query already
/// works and `get_cursor_pos` reports it unchanged.
struct CursorTrackerState(Option<cursor_tracker::CursorTracker>);

// ─── Shared types ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Vec2 {
    x: f64,
    y: f64,
}

// ─── Cursor position ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_cursor_pos(app: tauri::AppHandle, tracker: tauri::State<'_, CursorTrackerState>) -> Vec2 {
    use mouse_position::mouse_position::Mouse;
    let _ = &app; // used only on macOS; suppress unused-variable warning on other targets

    let (x, y) = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (x as f64, y as f64),
        Mouse::Error => return Vec2 { x: 0.0, y: 0.0 },
    };

    // On macOS, CGEventGetLocation returns logical points, not physical pixels.
    // Tauri positions windows in physical pixels (PhysicalPosition/PhysicalSize).
    // Multiply by the display scale factor so both coordinate spaces match.
    // Without this, on a 2x Retina display the pet tracks only the top-left
    // quadrant — cursor at the bottom-right corner appears to be at the centre.
    #[cfg(target_os = "macos")]
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = win.primary_monitor() {
            let scale = monitor.scale_factor();
            return Vec2 {
                x: x * scale,
                y: y * scale,
            };
        }
    }

    // On a Wayland session the X11 reading above is frozen unless the pointer
    // is over one of our own surfaces. When the evdev tracker is available it
    // integrates real motion and reconciles against this reading; otherwise
    // `tracker` is None and the native reading is returned unchanged.
    if let Some(t) = &tracker.0 {
        let (rx, ry) = t.reconcile(x, y);
        return Vec2 { x: rx, y: ry };
    }

    Vec2 { x, y }
}

/// Reports how NekoAI is sourcing the cursor position, so the frontend can fall
/// back to wanderer mode when the pet physically cannot follow the cursor.
///   `"native"`      — OS / X11 cursor query works (Windows, macOS, Xorg).
///   `"evdev"`       — Wayland session; cursor read from `/dev/input` via evdev.
///   `"unavailable"` — Wayland session with no readable input device; the pet
///                     cannot follow the cursor and should wander instead.
#[tauri::command]
fn cursor_tracking_status(tracker: tauri::State<'_, CursorTrackerState>) -> String {
    if tracker.0.is_some() {
        return "evdev".to_string();
    }
    #[cfg(target_os = "linux")]
    {
        if desktop_monitor::is_wayland_session() {
            return "unavailable".to_string();
        }
    }
    "native".to_string()
}

// ─── Window positioning & sizing ─────────────────────────────────────────────

#[tauri::command]
fn move_window(window: tauri::WebviewWindow, x: f64, y: f64) -> Result<(), String> {
    window
        .set_position(tauri::PhysicalPosition::new(x as i32, y as i32))
        .map_err(|e| e.to_string())
}

/// Resize the window in logical pixels, bypassing the JS resizable restriction.
/// `resizable: false` in tauri.conf.json removes WS_THICKFRAME on Windows which
/// silently blocks `window.setSize()` from JS. The Rust side calls SetWindowPos
/// directly and is not subject to that limitation.
#[tauri::command]
fn resize_window(window: tauri::WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

// ─── Window decorations ───────────────────────────────────────────────────────

#[tauri::command]
fn set_always_on_top(window: tauri::WebviewWindow, always_on_top: bool) -> Result<(), String> {
    window
        .set_always_on_top(always_on_top)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_ignore_cursor_events(window: tauri::WebviewWindow, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

// ─── Window shape mask (Linux only) ───────────────────────────────────────────
// WebKitGTK has a compositor bug on Linux where ARGB transparent windows blend
// sprite paints additively instead of replacing the previous frame, producing
// the "ghost-frame stacking" visual artifact. Workaround: keep the window
// technically opaque with a magenta chroma-key fill, then use GTK's
// gtk_widget_shape_combine_region to cut out non-sprite pixels from both the
// visual and input regions. The result is visually indistinguishable from a
// real transparent window — magenta becomes invisible AND click-through.
//
// Build the cairo region from the sprite's alpha channel (1 byte per pixel,
// row-major). Pixels with alpha > 128 are treated as opaque and added to the
// region via row-wise run-length encoding (typically <= 32 rectangles per
// 32×32 sprite — cheap enough to call at animation FPS).

#[tauri::command]
fn set_window_shape(
    window: tauri::WebviewWindow,
    mask: Vec<u8>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use cairo::{RectangleInt, Region};
        use gtk::prelude::WidgetExt;

        if mask.len() < (width * height) as usize {
            return Err(format!(
                "mask too small: got {} bytes, need {}",
                mask.len(),
                width * height
            ));
        }

        let region = Region::create();
        for y in 0..height as i32 {
            let mut span_start: Option<i32> = None;
            for x in 0..width as i32 {
                let idx = (y as u32 * width + x as u32) as usize;
                let opaque = mask[idx] > 128;
                match (opaque, span_start) {
                    (true, None) => span_start = Some(x),
                    (false, Some(start)) => {
                        let _ = region.union_rectangle(&RectangleInt::new(start, y, x - start, 1));
                        span_start = None;
                    }
                    _ => {}
                }
            }
            if let Some(start) = span_start {
                let _ =
                    region.union_rectangle(&RectangleInt::new(start, y, width as i32 - start, 1));
            }
        }

        let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
        gtk_window.shape_combine_region(Some(&region));
        gtk_window.input_shape_combine_region(Some(&region));
    }

    // Non-Linux platforms have working transparent windows; nothing to do.
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (window, mask, width, height); // suppress unused warnings
    }

    Ok(())
}

#[tauri::command]
fn clear_window_shape(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::WidgetExt;
        let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
        gtk_window.shape_combine_region(None);
        gtk_window.input_shape_combine_region(None);
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = window;
    }

    Ok(())
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ─── Secondary window (context menu) ──────────────────────────────────────────
//
// The sprite lives in the `main` window, which must never move or resize while
// a panel is showing. For context-menu / settings / pet-selector we spawn a
// separate `panel` window so the pet can keep following the cursor freely.

#[tauri::command]
async fn open_panel_window(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    route: String,
) -> Result<(), String> {
    // If an existing panel window is around, reposition + resize and show it.
    if let Some(win) = app.get_webview_window("panel") {
        win.set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32))
            .map_err(|e| e.to_string())?;
        // Navigate in case the requested route changed
        let url = format!("index.html#{}", route);
        win.eval(format!("window.location.hash = '{}'", route)).ok();
        let _ = url;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().ok();
        return Ok(());
    }

    let url = format!("index.html#{}", route);
    let builder =
        tauri::WebviewWindowBuilder::new(&app, "panel", tauri::WebviewUrl::App(url.into()))
            .title("NekoAI Panel")
            .inner_size(width, height)
            .position(x, y)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .focused(true);

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn close_panel_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("panel") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn resize_panel_window(app: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("panel") {
        win.set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Relay an action from the panel window to all windows via the Rust backend.
/// JS `emit()` may not reach other windows reliably; Rust `app.emit()` is global.
#[tauri::command]
async fn panel_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    app.emit("panel-action", action.clone())
        .map_err(|e| e.to_string())?;
    // Hide the panel after any action that opens a new view
    if action == "settings" || action == "select-pet" {
        if let Some(win) = app.get_webview_window("panel") {
            win.hide().ok();
        }
    }
    Ok(())
}

// ─── Config commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_config() -> AIConfig {
    storage::read_config()
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: AIConfig) -> Result<(), String> {
    storage::write_config(&config)?;
    // Notify all windows (HouseWindow, panel) that the config changed
    app.emit("config-updated", ()).ok();
    Ok(())
}

// ─── Conversation commands ────────────────────────────────────────────────────

#[tauri::command]
fn get_recent_messages(limit: u32) -> Result<Vec<StoredMessage>, String> {
    storage::get_recent_messages(limit)
}

#[tauri::command]
fn save_message(role: String, content: String) -> Result<(), String> {
    storage::save_message(&role, &content)
}

#[tauri::command]
fn prune_conversations(max_rows: u32, max_age_days: i64) -> Result<u32, String> {
    storage::prune_conversations(max_rows, max_age_days)
}

#[tauri::command]
fn clear_conversations() -> Result<u32, String> {
    storage::clear_conversations()
}

// ─── User fact commands ───────────────────────────────────────────────────────

#[tauri::command]
fn get_user_fact(key: String) -> Result<Option<String>, String> {
    storage::get_user_fact(&key)
}

#[tauri::command]
fn set_user_fact(key: String, value: String) -> Result<(), String> {
    storage::set_user_fact(&key, &value)
}

#[tauri::command]
fn get_all_user_facts() -> Result<std::collections::HashMap<String, String>, String> {
    storage::get_all_user_facts()
}

// ─── NVIDIA NIM proxy (bypasses WebView CORS) ────────────────────────────────

// Mirror of `DEFAULT_MAX_TOKENS` in src/ai/types.ts — keep both in sync.
// NIM lives on the Rust side because of CORS, so the JS constant cannot reach
// it without a duplicate. Once `config.maxTokens` ships (rec K), the value
// will flow in through the `nvidia_chat` command args and this becomes a
// fallback for `None`.
const DEFAULT_MAX_TOKENS: u32 = 256;

#[derive(serde::Deserialize)]
struct NimMessage {
    role: String,
    content: String,
}

#[tauri::command]
async fn nvidia_chat(
    api_key: String,
    model: String,
    messages: Vec<NimMessage>,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "max_tokens": DEFAULT_MAX_TOKENS,
        "messages": messages.iter().map(|m| serde_json::json!({
            "role": m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("NVIDIA NIM client error: {e}"))?;

    let resp = client
        .post("https://integrate.api.nvidia.com/v1/chat/completions")
        .header("authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("NVIDIA NIM request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("NVIDIA NIM API error: {status} — {text}"));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("NVIDIA NIM parse error: {e}"))?;

    data["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "NVIDIA NIM: unexpected response format".to_string())
}

// ─── Ollama proxy (bypasses WebView CORS) ────────────────────────────────────
//
// Ollama's daemon enforces a per-Origin CORS allowlist. Its default whitelist
// covers `http://localhost:*` and `http://127.0.0.1:*`, which matches the dev
// server (`http://localhost:1420`) but NOT the production webview origin
// (`http://tauri.localhost` on Windows). A direct browser-side `fetch()` from
// the installed app is silently rejected with 403, so detection and chat both
// happen Rust-side via `reqwest`, which sends no `Origin` header.
//
// Same pattern as `nvidia_chat` above.

#[derive(serde::Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[tauri::command]
async fn ollama_detect(base_url: Option<String>) -> Result<Vec<String>, String> {
    let url = format!(
        "{}/api/tags",
        base_url.unwrap_or_else(|| "http://localhost:11434".to_string())
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(2500))
        .build()
        .map_err(|e| format!("Ollama client error: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama API error: {}", resp.status()));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ollama parse error: {e}"))?;

    let models = data["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(str::to_string))
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(models)
}

#[tauri::command]
async fn ollama_chat(
    base_url: Option<String>,
    model: String,
    messages: Vec<OllamaMessage>,
    system_prompt: String,
) -> Result<String, String> {
    let url = format!(
        "{}/api/chat",
        base_url.unwrap_or_else(|| "http://localhost:11434".to_string())
    );

    let mut full_messages = vec![serde_json::json!({
        "role": "system",
        "content": system_prompt,
    })];
    full_messages.extend(messages.iter().map(|m| {
        serde_json::json!({
            "role": m.role,
            "content": m.content,
        })
    }));

    let body = serde_json::json!({
        "model": model,
        "stream": false,
        "options": { "num_predict": DEFAULT_MAX_TOKENS },
        "messages": full_messages,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Ollama client error: {e}"))?;

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama API error: {status} — {text}"));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Ollama parse error: {e}"))?;

    data["message"]["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "Ollama: unexpected response format".to_string())
}

// ─── Desktop monitor commands ─────────────────────────────────────────────────

#[tauri::command]
fn get_active_window() -> Option<desktop_monitor::WindowInfo> {
    desktop_monitor::get_active_window()
}

#[tauri::command]
fn get_all_windows() -> Vec<desktop_monitor::WindowInfo> {
    desktop_monitor::get_all_windows()
}

#[tauri::command]
fn get_idle_millis() -> u64 {
    desktop_monitor::get_idle_millis()
}

// ─── Autostart commands ───────────────────────────────────────────────────────

#[tauri::command]
fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    if storage::is_portable() {
        return Err("Autostart is not available in portable mode.".to_string());
    }
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().enable().map_err(|e| e.to_string())
}

#[tauri::command]
fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    if storage::is_portable() {
        return Err("Autostart is not available in portable mode.".to_string());
    }
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().disable().map_err(|e| e.to_string())
}

// ─── Tray helpers ─────────────────────────────────────────────────────────────

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            win.hide().ok();
        } else {
            show_window(app);
        }
    }
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        win.show().ok();
        win.set_focus().ok();
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_always_on_top(true).ok();

            // Position near house before making visible to avoid flash at (100, 100).
            // pet(32) + gap(4) + house(64) + margin(8) = 108 logical px from right
            // taskbar(48) + house(64) + margin(8) = 120 logical px from bottom
            if let Ok(Some(monitor)) = window.primary_monitor() {
                let scale = monitor.scale_factor();
                let mw = monitor.size().width as f64;
                let mh = monitor.size().height as f64;
                let x = (mw - 108.0 * scale) as i32;
                let y = (mh - 120.0 * scale) as i32;
                window.set_position(tauri::PhysicalPosition::new(x, y)).ok();
            }
            window.show().ok();

            // ── Background notification monitor ────────────────────────────
            // Detects when a non-NekoAI window gains focus while the user is
            // idle (no mouse/keyboard input), which strongly indicates a system
            // notification took focus. Emits "neko-notification" to all windows.
            {
                let app_handle = app.handle().clone();
                let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();
                app.manage(NotificationShutdown(Mutex::new(Some(shutdown_tx))));

                std::thread::spawn(move || {
                    let mut prev_title = String::new();
                    loop {
                        // Recv-with-timeout doubles as the polling interval and
                        // the shutdown signal: a sent unit OR a disconnected
                        // sender both end the loop cleanly.
                        match shutdown_rx.recv_timeout(std::time::Duration::from_millis(500)) {
                            Ok(_) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                            Err(mpsc::RecvTimeoutError::Timeout) => {}
                        }

                        // Only act when the user hasn't touched input for >1s
                        let idle_ms = desktop_monitor::get_idle_millis();
                        if idle_ms < 1000 {
                            prev_title.clear();
                            continue;
                        }

                        if let Some(win) = desktop_monitor::get_active_window() {
                            let proc = win.process_name.to_lowercase();
                            // Skip our own windows
                            if proc.contains("nekoai") || proc.is_empty() {
                                continue;
                            }
                            if !win.title.is_empty() && win.title != prev_title {
                                prev_title = win.title.clone();
                                app_handle.emit("neko-notification", win).ok();
                            }
                        }
                    }
                });
            }

            // ── Cursor tracker (Wayland fallback) ──────────────────────────
            // On a Wayland session X11 XQueryPointer only updates while the
            // pointer is over one of our own surfaces, so the pet stops
            // following the mouse. When a /dev/input mouse device is readable
            // the tracker integrates real motion; otherwise this is None and
            // the frontend falls back to wanderer mode (cursor_tracking_status).
            app.manage(CursorTrackerState(cursor_tracker::CursorTracker::start()));

            // ── Tray menu ──────────────────────────────────────────────────
            let show_hide =
                MenuItem::with_id(app, "show_hide", "Show/Hide NekoAI", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let pet_classic =
                MenuItem::with_id(app, "pet_classic", "Classic Neko", true, None::<&str>)?;
            let pet_ghost = MenuItem::with_id(app, "pet_ghost", "Ghost", true, None::<&str>)?;
            let pet_dragon =
                MenuItem::with_id(app, "pet_dragon", "Ember (Dragon)", true, None::<&str>)?;
            let pet_penguin =
                MenuItem::with_id(app, "pet_penguin", "Pingu (Penguin)", true, None::<&str>)?;
            let pet_shiba = MenuItem::with_id(app, "pet_shiba", "Shiba", true, None::<&str>)?;
            let select_pet = Submenu::with_items(
                app,
                "Select Pet",
                true,
                &[
                    &pet_classic,
                    &pet_ghost,
                    &pet_dragon,
                    &pet_penguin,
                    &pet_shiba,
                ],
            )?;
            let sep = PredefinedMenuItem::separator(app)?;
            let about = MenuItem::with_id(
                app,
                "about",
                &format!("About NekoAI v{}", env!("CARGO_PKG_VERSION")),
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&show_hide, &settings, &select_pet, &sep, &about, &quit],
            )?;

            let logo_bytes = include_bytes!("../icons/logo.png");
            let tray_icon = {
                let img = image::load_from_memory(logo_bytes)
                    .map(|i| i.into_rgba8())
                    .ok();
                if let Some(rgba) = img {
                    let (w, h) = (rgba.width(), rgba.height());
                    tauri::image::Image::new_owned(rgba.into_raw(), w, h)
                } else {
                    app.default_window_icon().unwrap().clone()
                }
            };

            TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("NekoAI")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_hide" => toggle_window(app),
                    "settings" => {
                        show_window(app);
                        app.emit("tray-settings", ()).ok();
                    }
                    "pet_classic" => {
                        show_window(app);
                        app.emit("tray-select-pet", "classic-neko").ok();
                    }
                    "pet_ghost" => {
                        show_window(app);
                        app.emit("tray-select-pet", "ghost-pixel").ok();
                    }
                    "pet_dragon" => {
                        show_window(app);
                        app.emit("tray-select-pet", "dragon-pixel").ok();
                    }
                    "pet_penguin" => {
                        show_window(app);
                        app.emit("tray-select-pet", "penguin-pixel").ok();
                    }
                    "pet_shiba" => {
                        show_window(app);
                        app.emit("tray-select-pet", "shiba-pixel").ok();
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            quit_app,
            open_panel_window,
            close_panel_window,
            resize_panel_window,
            panel_action,
            get_cursor_pos,
            cursor_tracking_status,
            move_window,
            resize_window,
            set_always_on_top,
            set_ignore_cursor_events,
            set_window_shape,
            clear_window_shape,
            get_config,
            save_config,
            get_recent_messages,
            save_message,
            prune_conversations,
            clear_conversations,
            get_user_fact,
            set_user_fact,
            get_all_user_facts,
            get_active_window,
            get_all_windows,
            get_idle_millis,
            enable_autostart,
            disable_autostart,
            open_url,
            nvidia_chat,
            ollama_detect,
            ollama_chat,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                // Drop the notification monitor's shutdown sender so the
                // background thread leaves its recv_timeout loop cleanly
                // instead of being torn down mid-poll.
                if let Some(state) = app_handle.try_state::<NotificationShutdown>() {
                    if let Some(tx) = state.0.lock().ok().and_then(|mut g| g.take()) {
                        let _ = tx.send(());
                    }
                }
            }
        });
}
