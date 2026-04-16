use serde::Serialize;
use tauri::Manager;

mod storage;
use storage::{AIConfig, StoredMessage};

// ─── Shared types ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Vec2 {
    x: f64,
    y: f64,
}

// ─── Cursor position ──────────────────────────────────────────────────────────

/// Returns the current cursor position in physical screen pixels.
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

// ─── App lifecycle ────────────────────────────────────────────────────────────

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ─── Config commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_config() -> AIConfig {
    storage::read_config()
}

#[tauri::command]
fn save_config(config: AIConfig) -> Result<(), String> {
    storage::write_config(&config)
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

// ─── User fact commands ───────────────────────────────────────────────────────

#[tauri::command]
fn get_user_fact(key: String) -> Result<Option<String>, String> {
    storage::get_user_fact(&key)
}

#[tauri::command]
fn set_user_fact(key: String, value: String) -> Result<(), String> {
    storage::set_user_fact(&key, &value)
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
            quit_app,
            get_cursor_pos,
            move_window,
            set_always_on_top,
            set_ignore_cursor_events,
            get_config,
            save_config,
            get_recent_messages,
            save_message,
            get_user_fact,
            set_user_fact,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
