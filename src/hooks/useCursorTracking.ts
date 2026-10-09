import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type CursorTracking = 'native' | 'evdev' | 'unavailable'

/**
 * How the backend can source the cursor position (see cursor_tracker.rs). On a
 * Wayland session with no readable /dev/input device it is 'unavailable': the
 * pet cannot follow the mouse and falls back to wanderer mode. Probed once;
 * stays 'native' on any failure.
 */
export function useCursorTracking(): CursorTracking {
  const [cursorTracking, setCursorTracking] = useState<CursorTracking>('native')

  useEffect(() => {
    void (async () => {
      try {
        const status = await invoke<string>('cursor_tracking_status')
        if (status === 'evdev' || status === 'unavailable') {
          setCursorTracking(status)
        }
      } catch {
        // Backend unavailable — keep the 'native' default.
      }
    })()
  }, [])

  return cursorTracking
}
