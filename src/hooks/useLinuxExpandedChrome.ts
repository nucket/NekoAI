import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_LINUX } from '../utils/platform'

/**
 * Expanded-state lifecycle (bubble, settings, pet selector).
 *
 * On Linux, where the window is opaque with a magenta chroma-key fill, any of
 * these expanded states grow the window past sprite size, so:
 *   1. The sprite-sized GTK shape mask must be cleared — otherwise the panel
 *      UI is clipped to a tiny rectangle in the window's top-left.
 *   2. The body's chroma-key magenta fill must be swapped for a dark fill so
 *      we don't see magenta peek through the panel's edges/corners.
 * On collapse, the sprite remounts and PetRenderer re-pushes the shape on the
 * next frame, and the chroma-key class comes back.
 * On Windows / macOS the window is natively transparent: nothing to do.
 */
export function useLinuxExpandedChrome(isExpanded: boolean) {
  useEffect(() => {
    if (!IS_LINUX) return
    document.body.classList.toggle('chroma-key', !isExpanded)
    document.body.classList.toggle('panel-bg', isExpanded)
    if (isExpanded) {
      invoke('clear_window_shape').catch(() => {})
    }
  }, [isExpanded])
}
