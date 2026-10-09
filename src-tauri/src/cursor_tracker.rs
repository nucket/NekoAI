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
//! evdev reports raw device counts, but the compositor applies pointer
//! acceleration (libinput) before moving the cursor, so integrating the raw
//! counts drifts from the real cursor. Every reconcile with an authoritative
//! X reading compares the real displacement with the raw counts since the
//! previous one and nudges a learned gain toward that ratio (see
//! `learn_gain`). libinput's acceleration depends on speed, so one gain is an
//! approximation: it keeps the estimate close between reconciles rather than
//! exact.
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
    /// Learned ratio between cursor pixels and raw device counts.
    gain: f64,
    /// Raw device counts since the last authoritative reading.
    raw_dx: f64,
    raw_dy: f64,
    /// True when the estimate hit the screen bounds since that reading, which
    /// makes the displacement useless for learning the gain.
    clamped: bool,
}

/// Smallest raw / real displacement (counts / px) worth learning from; short
/// moves are dominated by rounding and sensor noise.
#[cfg(any(target_os = "linux", test))]
const GAIN_MIN_RAW: f64 = 80.0;
#[cfg(any(target_os = "linux", test))]
const GAIN_MIN_REAL: f64 = 40.0;
/// How far one sample moves the learned gain (exponential moving average).
#[cfg(any(target_os = "linux", test))]
const GAIN_ALPHA: f64 = 0.3;
/// Plausible range for the gain; anything outside is treated as noise.
#[cfg(any(target_os = "linux", test))]
const GAIN_RANGE: (f64, f64) = (0.25, 4.0);

/// Updates the learned pointer gain from one interval between authoritative
/// readings: `raw` is the summed device counts, `real` the cursor's actual
/// displacement in pixels. Intervals too short to be meaningful leave the
/// gain unchanged.
#[cfg(any(target_os = "linux", test))]
fn learn_gain(gain: f64, raw: (f64, f64), real: (f64, f64)) -> f64 {
    let raw_len = raw.0.hypot(raw.1);
    let real_len = real.0.hypot(real.1);
    if raw_len < GAIN_MIN_RAW || real_len < GAIN_MIN_REAL {
        return gain;
    }
    let sample = (real_len / raw_len).clamp(GAIN_RANGE.0, GAIN_RANGE.1);
    gain + (sample - gain) * GAIN_ALPHA
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
            let had_anchor = pos.last_xq_x.is_finite() && pos.last_xq_y.is_finite();
            if changed {
                if had_anchor && !pos.clamped {
                    let real = (xq_x - pos.last_xq_x, xq_y - pos.last_xq_y);
                    pos.gain = learn_gain(pos.gain, (pos.raw_dx, pos.raw_dy), real);
                }
                pos.x = xq_x;
                pos.y = xq_y;
                pos.raw_dx = 0.0;
                pos.raw_dy = 0.0;
                pos.clamped = false;
            }
            pos.last_xq_x = xq_x;
            pos.last_xq_y = xq_y;
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
                gain: 1.0,
                raw_dx: 0.0,
                raw_dy: 0.0,
                clamped: false,
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
                let (dx, dy) = (f64::from(dx), f64::from(dy));
                pos.raw_dx += dx;
                pos.raw_dy += dy;
                let x = pos.x + dx * pos.gain;
                let y = pos.y + dy * pos.gain;
                pos.x = x.clamp(min_x, max_x);
                pos.y = y.clamp(min_y, max_y);
                if pos.x != x || pos.y != y {
                    pos.clamped = true;
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gain_moves_toward_the_observed_ratio() {
        // 200 raw counts moved the cursor 300 px: acceleration of 1.5x.
        let g = learn_gain(1.0, (200.0, 0.0), (300.0, 0.0));
        assert!((g - (1.0 + 0.5 * GAIN_ALPHA)).abs() < 1e-9);
        // Repeated samples converge on the ratio.
        let mut g = 1.0;
        for _ in 0..30 {
            g = learn_gain(g, (120.0, 160.0), (180.0, 240.0));
        }
        assert!((g - 1.5).abs() < 1e-3);
    }

    #[test]
    fn short_or_implausible_moves_do_not_corrupt_the_gain() {
        assert_eq!(learn_gain(1.2, (10.0, 0.0), (30.0, 0.0)), 1.2);
        assert_eq!(learn_gain(1.2, (300.0, 0.0), (5.0, 0.0)), 1.2);
        // A wild ratio is clamped to the plausible range before averaging.
        let g = learn_gain(1.0, (100.0, 0.0), (10_000.0, 0.0));
        assert!((g - (1.0 + (GAIN_RANGE.1 - 1.0) * GAIN_ALPHA)).abs() < 1e-9);
    }
}
