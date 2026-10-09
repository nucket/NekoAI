import { useEffect, useRef } from 'react'
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '../store/configStore'
import { DEFAULT_PET_SIZE } from '../constants/layout'
import { quadrantAnchor, workAreaOf, type PhysicalPoint } from '../utils/monitor'

/**
 * Grows the main window into a `width`×`height` (logical px) panel while
 * `isOpen`, anchored at the cursor on the side of the monitor with more room,
 * and shrinks it back to the sprite at its previous position on close.
 * Shared by Settings and the pet selector.
 */
export function usePanelWindow(isOpen: boolean, width: number, height: number, label: string) {
  const savedPosRef = useRef<PhysicalPoint | null>(null)

  useEffect(() => {
    let cancelled = false
    const win = getCurrentWindow()

    async function expand() {
      try {
        const [pos, monitor, cursor] = await Promise.all([
          win.outerPosition(),
          currentMonitor(),
          invoke<PhysicalPoint>('get_cursor_pos'),
        ])
        if (cancelled) return
        savedPosRef.current = { x: pos.x, y: pos.y }

        // Usable bounds of the active monitor (excludes the taskbar / dock)
        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
        const { x, y } = quadrantAnchor(cursor, width * scale, height * scale, workAreaOf(monitor))

        await win.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
        await invoke('resize_window', { width, height })
      } catch (err) {
        console.error(`[${label}] expand error:`, err)
      }
    }

    async function collapse() {
      const snap = savedPosRef.current
      savedPosRef.current = null
      if (!snap) return
      const sz = useConfigStore.getState().config.petSize ?? DEFAULT_PET_SIZE
      try {
        await invoke('resize_window', { width: sz, height: sz })
        if (!cancelled) await win.setPosition(new PhysicalPosition(snap.x, snap.y))
      } catch (err) {
        console.error(`[${label}] collapse error:`, err)
      }
    }

    if (isOpen) void expand()
    else void collapse()
    return () => {
      cancelled = true
    }
  }, [isOpen, width, height, label])
}
