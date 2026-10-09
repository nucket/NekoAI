// ─── Window layout constants (logical px) ─────────────────────────────────────
// Shared by every component that resizes or positions a window, so the sizes
// live in one place.

/** Sprite size when the user hasn't picked one. */
export const DEFAULT_PET_SIZE = 32

/**
 * Main window while the speech bubble is open. The height was raised from 300
 * to 380 to give replies room alongside DEFAULT_MAX_TOKENS = 512. Keep it in
 * sync with `.speech-bubble__messages { max-height }` in SpeechBubble.css.
 */
export const BUBBLE_WIN_W = 300
export const BUBBLE_WIN_H = 380

/** Context-menu panel window (PanelWindow, opened from App). */
export const MENU_W = 190
export const MENU_H = 260

/** Settings panel, shown inside the main window. */
export const SETTINGS_W = 280
export const SETTINGS_H = 600

/** Pet selector, shown inside the main window. */
export const SELECTOR_W = 240
export const SELECTOR_H = 320

/**
 * House window. The Rust startup placement in lib.rs (108 / 72 logical px from
 * the work-area corner) assumes this size; update both together.
 */
export const HOUSE_SIZE = 64
