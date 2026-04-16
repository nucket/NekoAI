use tauri::Manager;

#[tauri::command]
fn set_always_on_top(window: tauri::Window, always_on_top: bool) {
    window.set_always_on_top(always_on_top).ok();
}

#[tauri::command]
fn set_ignore_cursor_events(window: tauri::Window, ignore: bool) {
    window.set_ignore_cursor_events(ignore).ok();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            // Ensure transparency is applied on startup
            window.set_always_on_top(true).ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_always_on_top,
            set_ignore_cursor_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
