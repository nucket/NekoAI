import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback } from 'react'

export function useDraggable() {
  const onMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (e.button === 0) {
      const appWindow = getCurrentWindow()
      await appWindow.startDragging()
    }
  }, [])

  return { onMouseDown }
}
