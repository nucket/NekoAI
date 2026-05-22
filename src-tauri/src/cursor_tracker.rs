//! Global cursor tracking with a Wayland fallback.
//!
//! NekoAI reads the cursor position via the `mouse_position` crate, which on
//! Linux calls X11 `XQueryPointer`. That works perfectly under Xorg. On a
//! Wayland session the app runs as an XWayland client, and `XQueryPointer`
//! only returns a *live* position while the pointer is physically over one of
//! NekoAI's own input surfaces (the sprite shape, or the right-click menu).
//! Everywhere else the reading is frozen, so the pet appears to stop following
//! the mouse — it only twitches to life while the context menu is open.
//!
//! This module works around that on Linux by reading raw relative motion from
//! mouse devices under `/dev/input` via evdev, integrating an absolute
//! position, and reconciling it against `XQueryPointer` whenever that reading
//! *does* change (which means the pointer is momentarily over one of our
//! surfaces and the X reading is authoritative).
//!
//! Reading `/dev/input/event*` requires membership in the `input` group. When
//! no device can be opened, `CursorTracker::start` returns `None` and the
//! caller (the frontend, via `cursor_tracking_status`) falls back to wanderer
//! mode so the pet still feels alive.

#[cfg(target_os = "linux")]
use std::sync::{Arc, Mutex};

/// Integrated cursor state shared between the evdev reader threads and the
/// `get_cursor_pos` command.
#[cfg(target_os = "linux")]
struct Pos {
    /// Current best estimate of the cursor position, in X11 root pixels.
    x: f64,
    y: f64,
    /// Last value seen from `XQueryPointer`. Used to detect when that reading
    /// changes — when it does, the pointer is over one of our surfaces and the
    /// X reading is authoritative. Seeded to infinity so the first reconcile
    /// always snaps to the real X reading.
    last_xq_x: f64,
    last_xq_y: f64,
}

#[cfg(target_os = "linux")]
struct Shared {
    pos: Mutex<Pos>,
    /// Virtual-desktop bounds `(min_x, min_y, max_x, max_y)` used to clamp the
    /// integrated position so it can never drift off-screen.
    bounds: (f64, f64, f64, f64),
}

/// Handle to the running cursor tracker. Cross-platform by design: it only
/// ever carries state on a Linux Wayland session with a readable mouse device;
/// on every other target it is a zero-sized marker that is never constructed.
pub struct CursorTracker {
    #[cfg(target_os = "linux")]
    shared: Arc<Shared>,
}

impl CursorTracker {
    /// Starts the evdev-based cursor tracker. Returns `None` — meaning the
    /// caller should rely on the native cursor query unchanged — when:
    ///   * the platform is not Linux, or
    ///   * the session is not Wayland (native `XQueryPointer` already works), or
    ///   * no mouse device under `/dev/input` could be opened for reading.
    pub fn start() -> Option<CursorTracker> {
        #[cfg(target_os = "linux")]
        {
            linux::start()
        }
        #[cfg(not(target_os = "linux"))]
        {
            None
        }
    }

    /// Reconciles the evdev-integrated position with a fresh `XQueryPointer`
    /// reading and returns the position NekoAI should use.
    ///
    /// When the X reading changed since the previous call the pointer is over
    /// one of our surfaces, so that reading is authoritative and the
    /// integrated position is snapped to it. Otherwise the X reading is frozen
    /// and the evdev-integrated position is returned instead.
    pub fn reconcile(&self, xq_x: f64, xq_y: f64) -> (f64, f64) {
        #[cfg(target_os = "linux")]
        {
            let mut pos = self.shared.pos.lock().unwrap_or_else(|e| e.into_inner());
            let changed =
                (pos.last_xq_x - xq_x).abs() >= 1.0 || (pos.last_xq_y - xq_y).abs() >= 1.0;
            pos.last_xq_x = xq_x;
            pos.last_xq_y = xq_y;
            if changed {
                pos.x = xq_x;
                pos.y = xq_y;
            }
            (pos.x, pos.y)
        }
        #[cfg(not(target_os = "linux"))]
        {
            (xq_x, xq_y)
        }
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::{CursorTracker, Pos, Shared};
    use evdev::{Device, EventType, RelativeAxisCode};
    use std::sync::{Arc, Mutex};
    use std::thread;

    pub fn start() -> Option<CursorTracker> {
        // Xorg sessions: XQueryPointer is already live and global — no fallback
        // needed, and reading /dev/input would be a needless privilege grab.
        if !crate::desktop_monitor::is_wayland_session() {
            return None;
        }

        let bounds = screen_bounds();
        let shared = Arc::new(Shared {
            pos: Mutex::new(Pos {
                x: (bounds.0 + bounds.2) / 2.0,
                y: (bounds.1 + bounds.3) / 2.0,
                last_xq_x: f64::INFINITY,
                last_xq_y: f64::INFINITY,
            }),
            bounds,
        });

        // evdev::enumerate() silently skips devices it cannot open, so on a
        // system where the user is not in the `input` group this yields
        // nothing and the tracker reports itself unavailable.
        let mut started = false;
        for (_path, device) in evdev::enumerate() {
            if !is_mouse(&device) {
                continue;
            }
            let shared = Arc::clone(&shared);
            if thread::Builder::new()
                .name("nekoai-cursor".into())
                .spawn(move || read_loop(device, shared))
                .is_ok()
            {
                started = true;
            }
        }

        if started {
            Some(CursorTracker { shared })
        } else {
            None
        }
    }

    /// A device counts as a pointing device if it reports both relative axes.
    fn is_mouse(device: &Device) -> bool {
        device.supported_relative_axes().is_some_and(|axes| {
            axes.contains(RelativeAxisCode::REL_X) && axes.contains(RelativeAxisCode::REL_Y)
        })
    }

    /// Blocking read loop for one device. Integrates relative motion into the
    /// shared position. Ends silently if the device errors (e.g. unplugged) —
    /// other devices' threads keep running. The thread is detached and dies
    /// with the process; no explicit shutdown is needed.
    fn read_loop(mut device: Device, shared: Arc<Shared>) {
        loop {
            let events = match device.fetch_events() {
                Ok(events) => events,
                Err(_) => return,
            };

            let mut dx = 0_i32;
            let mut dy = 0_i32;
            for event in events {
                if event.event_type() == EventType::RELATIVE {
                    let code = event.code();
                    if code == RelativeAxisCode::REL_X.0 {
                        dx += event.value();
                    } else if code == RelativeAxisCode::REL_Y.0 {
                        dy += event.value();
                    }
                }
            }

            if dx != 0 || dy != 0 {
                let (min_x, min_y, max_x, max_y) = shared.bounds;
                let mut pos = shared.pos.lock().unwrap_or_else(|e| e.into_inner());
                pos.x = (pos.x + f64::from(dx)).clamp(min_x, max_x);
                pos.y = (pos.y + f64::from(dy)).clamp(min_y, max_y);
            }
        }
    }

    /// Bounding box of the whole X screen — under XWayland the root window
    /// spans every monitor, matching the coordinate space `XQueryPointer`
    /// reports. Falls back to a generous box if the X connection fails.
    fn screen_bounds() -> (f64, f64, f64, f64) {
        use x11rb::connection::Connection as _;
        use x11rb::rust_connection::RustConnection;

        if let Ok((conn, screen_num)) = RustConnection::connect(None) {
            let screen = &conn.setup().roots[screen_num];
            return (
                0.0,
                0.0,
                f64::from(screen.width_in_pixels),
                f64::from(screen.height_in_pixels),
            );
        }
        (0.0, 0.0, 65535.0, 65535.0)
    }
}
