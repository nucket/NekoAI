use serde::Serialize;
use tauri::Manager;

// ─── Shared types ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Vec2 {
    x: f64,
    y: f64,
}

// ─── Cursor position ──────────────────────────────────────────────────────────

/// Returns the current cursor position in physical screen pixels.
///
/// Uses the `mouse_position` crate which calls the native OS API:
/// - Windows: `user32::GetCursorPos`
/// - macOS:   `CGEventGetLocation`
/// - Linux:   X11 / Wayland query
#[tauri::command]
fn get_cursor_pos() -> Vec2 {
    use mouse_position::mouse_position::Mouse;

    match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Vec2 {
            x: x as f64,
            y: y as f64,
        },
        Mouse::Error => Vec2 { x: 0.0, y: 0.0 },
    }
}

// ─── Window positioning ───────────────────────────────────────────────────────

/// Moves the calling webview window to an absolute screen position
/// (physical pixels, top-left origin).
#[tauri::command]
fn move_window(window: tauri::WebviewWindow, x: f64, y: f64) -> Result<(), String> {
    window
        .set_position(tauri::PhysicalPosition::new(x as i32, y as i32))
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
fn set_ignore_cursor_events(
    window: tauri::WebviewWindow,
    ignore: bool,
) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_always_on_top(true).ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_cursor_pos,
            move_window,
            set_always_on_top,
            set_ignore_cursor_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
