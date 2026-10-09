import { invoke } from '@tauri-apps/api/core'
import { currentMonitor } from '@tauri-apps/api/window'
import { MENU_H, MENU_W } from '../constants/layout'
import { quadrantAnchor, workAreaOf, type PhysicalPoint } from './monitor'

/**
 * Opens the context menu in its own panel window, next to the cursor on
 * whichever monitor the pet is on, growing toward the side with more room so
 * it never goes off that screen.
 */
export async function openContextMenu(): Promise<void> {
  try {
    const [cursor, monitor] = await Promise.all([
      invoke<PhysicalPoint>('get_cursor_pos'),
      currentMonitor(),
    ])
    const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
    const { x, y } = quadrantAnchor(cursor, MENU_W * scale, MENU_H * scale, workAreaOf(monitor))

    await invoke('open_panel_window', {
      x, // physical
      y, // physical
      width: MENU_W, // logical
      height: MENU_H, // logical
      route: 'context-menu',
    })
  } catch (err) {
    console.error('[NekoAI] open context menu failed:', err)
  }
}
