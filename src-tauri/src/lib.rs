use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

mod storage;
mod desktop_monitor;
use storage::{AIConfig, StoredMessage};

// ─── Shared types ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Vec2 {
    x: f64,
    y: f64,
}

// ─── Cursor position ──────────────────────────────────────────────────────────

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
        win.eval(&format!("window.location.hash = '{}'", route))
            .ok();
        let _ = url;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().ok();
        return Ok(());
    }

    let url = format!("index.html#{}", route);
    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        "panel",
        tauri::WebviewUrl::App(url.into()),
    )
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
async fn resize_panel_window(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("panel") {
        win.set_size(tauri::LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app.shell().open(&url, None).map_err(|e| e.to_string())?;
    Ok(())
}

/// Relay an action from the panel window to all windows via the Rust backend.
/// JS `emit()` may not reach other windows reliably; Rust `app.emit()` is global.
#[tauri::command]
async fn panel_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    app.emit("panel-action", &action).map_err(|e| e.to_string())?;
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

#[tauri::command]
fn get_all_user_facts() -> Result<std::collections::HashMap<String, String>, String> {
    storage::get_all_user_facts()
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

            // ── Tray menu ──────────────────────────────────────────────────
            let show_hide   = MenuItem::with_id(app, "show_hide",   "Show/Hide NekoAI",     true, None::<&str>)?;
            let settings    = MenuItem::with_id(app, "settings",    "Settings",              true, None::<&str>)?;
            let pet_classic = MenuItem::with_id(app, "pet_classic", "Classic Neko",          true, None::<&str>)?;
            let pet_ghost   = MenuItem::with_id(app, "pet_ghost",   "Ghost",                 true, None::<&str>)?;
            let pet_shiba   = MenuItem::with_id(app, "pet_shiba",   "Shiba",                 true, None::<&str>)?;
            let select_pet  = Submenu::with_items(app, "Select Pet", true, &[&pet_classic, &pet_ghost, &pet_shiba])?;
            let sep         = PredefinedMenuItem::separator(app)?;
            let about       = MenuItem::with_id(app, "about",       "About NekoAI v0.2.0",  true, None::<&str>)?;
            let quit        = MenuItem::with_id(app, "quit",        "Quit",                  true, None::<&str>)?;

            let menu = Menu::with_items(app, &[
                &show_hide,
                &settings,
                &select_pet,
                &sep,
                &about,
                &quit,
            ])?;

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
            move_window,
            resize_window,
            set_always_on_top,
            set_ignore_cursor_events,
            get_config,
            save_config,
            get_recent_messages,
            save_message,
            get_user_fact,
            set_user_fact,
            get_all_user_facts,
            get_active_window,
            get_all_windows,
            get_idle_millis,
            enable_autostart,
            disable_autostart,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
