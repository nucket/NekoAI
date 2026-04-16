use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Serialize, Clone, Debug)]
pub struct WindowInfo {
    pub title: String,
    pub process_name: String,
    pub rect: Rect,
}

// ─── Windows implementation ───────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod win_impl {
    use super::{Rect, WindowInfo};
    use std::ptr::null_mut;
    use windows::Win32::Foundation::{CloseHandle, BOOL, HMODULE, HWND, LPARAM, RECT};
    use windows::Win32::System::ProcessStatus::K32GetModuleBaseNameW;
    use windows::Win32::System::SystemInformation::GetTickCount64;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowTextW,
        GetWindowThreadProcessId, IsWindowVisible,
    };

    pub fn get_active_window() -> Option<WindowInfo> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            window_info_from_hwnd(hwnd)
        }
    }

    pub fn get_all_windows() -> Vec<WindowInfo> {
        let mut result: Vec<WindowInfo> = Vec::new();
        unsafe {
            let _ = EnumWindows(
                Some(enum_callback),
                LPARAM(&mut result as *mut Vec<WindowInfo> as isize),
            );
        }
        result
    }

    pub fn get_idle_millis() -> u64 {
        unsafe {
            let mut info = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if GetLastInputInfo(&mut info).as_bool() {
                GetTickCount64().saturating_sub(info.dwTime as u64)
            } else {
                0
            }
        }
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }
        let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);
        if let Some(info) = window_info_from_hwnd(hwnd) {
            if !info.title.is_empty() {
                windows.push(info);
            }
        }
        BOOL(1) // continue enumeration
    }

    unsafe fn window_info_from_hwnd(hwnd: HWND) -> Option<WindowInfo> {
        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..title_len as usize]).to_string();

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        let process_name = get_process_name(pid).unwrap_or_default();

        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);

        Some(WindowInfo {
            title,
            process_name,
            rect: Rect {
                x: rect.left,
                y: rect.top,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top,
            },
        })
    }

    fn get_process_name(pid: u32) -> Option<String> {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut name_buf = [0u16; 260];
            let len = K32GetModuleBaseNameW(handle, HMODULE(null_mut()), &mut name_buf);
            let _ = CloseHandle(handle);
            if len == 0 {
                return None;
            }
            Some(String::from_utf16_lossy(&name_buf[..len as usize]).to_string())
        }
    }
}

// ─── Public API — falls back to empty stubs on non-Windows ───────────────────

pub fn get_active_window() -> Option<WindowInfo> {
    #[cfg(target_os = "windows")]
    {
        win_impl::get_active_window()
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

pub fn get_all_windows() -> Vec<WindowInfo> {
    #[cfg(target_os = "windows")]
    {
        win_impl::get_all_windows()
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![]
    }
}

pub fn get_idle_millis() -> u64 {
    #[cfg(target_os = "windows")]
    {
        win_impl::get_idle_millis()
    }
    #[cfg(not(target_os = "windows"))]
    {
        0
    }
}
