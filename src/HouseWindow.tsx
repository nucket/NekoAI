import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { listen } from '@tauri-apps/api/event'
import { useConfigStore } from './store/configStore'

const HOUSE_SIZE = 64

export function HouseWindow() {
  const [placed, setPlaced] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const [housePos, setHousePos] = useState<{ x: number; y: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // This is a separate WebView — load config independently from the main window
  const { config, isLoaded, loadConfig } = useConfigStore()
  const activePetId = config.activePetId ?? 'classic-neko'

  useEffect(() => {
    if (!isLoaded) loadConfig()
  }, [isLoaded, loadConfig])

  // Refresh when the user switches pets in the main window
  useEffect(() => {
    const unlisten = listen('config-updated', () => {
      loadConfig()
    })
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [loadConfig])

  // Reset failed state whenever the active pet changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImgFailed(false)
  }, [activePetId])

  // Position and show the house window once on mount
  useEffect(() => {
    async function positionHouse() {
      try {
        // primaryMonitor() always returns data — currentMonitor() returns null
        // for hidden windows that haven't been placed on a monitor yet.
        const monitor = await primaryMonitor()
        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
        const monX = monitor?.position.x ?? 0
        const monY = monitor?.position.y ?? 0
        const monW = monitor?.size.width ?? window.screen.width * scale
        const monH = monitor?.size.height ?? window.screen.height * scale

        // Exact taskbar height: total screen height minus available height (CSS px → physical).
        const taskbarH = (window.screen.height - window.screen.availHeight) * scale
        const margin = 8 * scale

        const win = getCurrentWindow()
        const x = monX + monW - HOUSE_SIZE * scale - margin
        const y = monY + monH - taskbarH - HOUSE_SIZE * scale - margin

        await win.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
        await win.show()
        setHousePos({ x, y })
        setPlaced(true)
      } catch (err) {
        console.error('[HouseWindow] positioning error:', err)
      }
    }

    positionHouse()
  }, [])

  // Send pet home when the house is clicked
  const handleClick = useCallback(async () => {
    if (!housePos) return
    await invoke('panel_action', {
      action: `house_pos:${housePos.x},${housePos.y}`,
    }).catch(console.error)
  }, [housePos])

  // Extract the alpha channel of the house PNG and push it as a GTK shape
  // mask so the magenta chroma-key fill becomes invisible. Runs whenever the
  // pet changes (src reload → new <img> load event).
  const applyHouseShape = useCallback((img: HTMLImageElement) => {
    if (!img.complete || img.naturalWidth === 0) return
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = HOUSE_SIZE
    tempCanvas.height = HOUSE_SIZE
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, HOUSE_SIZE, HOUSE_SIZE)
    try {
      const data = ctx.getImageData(0, 0, HOUSE_SIZE, HOUSE_SIZE).data
      const mask = new Uint8Array(HOUSE_SIZE * HOUSE_SIZE)
      for (let i = 0; i < mask.length; i++) {
        mask[i] = data[i * 4 + 3]
      }
      invoke('set_window_shape', {
        mask: Array.from(mask),
        width: HOUSE_SIZE,
        height: HOUSE_SIZE,
      }).catch(() => {})
    } catch {
      // canvas tainted (shouldn't happen for same-origin) — skip
    }
  }, [])

  // Build the CSS-fallback house silhouette on a hidden canvas and push that
  // as the shape mask. Mirrors the divs rendered below (roof triangle + body
  // rect, bottom-aligned, horizontally centered in the 64×64 window). Used
  // when the active pet has no custom house.png — most bundled pets fall
  // through here, so making this path mask-clean is important.
  const applyCssFallbackShape = useCallback(() => {
    const canvas = document.createElement('canvas')
    canvas.width = HOUSE_SIZE
    canvas.height = HOUSE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Colour irrelevant; only alpha contributes to the mask.
    ctx.fillStyle = '#fff'
    // Roof: triangle 56w × 24h, apex at top, anchored 4px from top margin to
    // match the bottom-aligned flex layout below (justifyContent: flex-end).
    ctx.beginPath()
    ctx.moveTo(32, 4)
    ctx.lineTo(60, 28)
    ctx.lineTo(4, 28)
    ctx.closePath()
    ctx.fill()
    // Body: 48w × 36h, 2px overlap with the roof base.
    ctx.fillRect(8, 26, 48, 36)
    try {
      const data = ctx.getImageData(0, 0, HOUSE_SIZE, HOUSE_SIZE).data
      const mask = new Uint8Array(HOUSE_SIZE * HOUSE_SIZE)
      for (let i = 0; i < mask.length; i++) {
        mask[i] = data[i * 4 + 3]
      }
      invoke('set_window_shape', {
        mask: Array.from(mask),
        width: HOUSE_SIZE,
        height: HOUSE_SIZE,
      }).catch(() => {})
    } catch {
      // unreachable for same-origin canvas — skip
    }
  }, [])

  useEffect(() => {
    if (imgFailed) {
      applyCssFallbackShape()
    }
  }, [imgFailed, applyCssFallbackShape])

  // The <img> onLoad event doesn't fire for cached images on remount, so the
  // shape would never be applied after a pet switch (the browser already has
  // the new house.png cached). Run this after each render and check complete.
  useEffect(() => {
    if (imgFailed || !placed) return
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      applyHouseShape(img)
    }
  }, [activePetId, imgFailed, placed, applyHouseShape])

  if (!placed) return null

  return (
    <div style={styles.root} onClick={handleClick} title="Click to bring pet home">
      {imgFailed ? (
        // CSS fallback when the active pet has no house.png
        <>
          <div style={styles.roof} />
          <div style={styles.body}>
            <div style={styles.door} />
          </div>
        </>
      ) : (
        <img
          ref={imgRef}
          src={`/pets/${activePetId}/house.png`}
          width={HOUSE_SIZE}
          height={HOUSE_SIZE}
          style={styles.img}
          onError={() => setImgFailed(true)}
          onLoad={(e) => applyHouseShape(e.currentTarget)}
          alt="Pet house"
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: HOUSE_SIZE,
    height: HOUSE_SIZE,
    position: 'relative',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    background: 'rgba(0,0,0,0.01)', // prevent click-through on transparent area
  },
  img: {
    imageRendering: 'pixelated',
    objectFit: 'contain',
  },
  roof: {
    width: 0,
    height: 0,
    borderLeft: '28px solid transparent',
    borderRight: '28px solid transparent',
    borderBottom: '24px solid #d45d5d',
    marginBottom: '-2px',
    zIndex: 2,
  },
  body: {
    width: 48,
    height: 36,
    backgroundColor: '#e6d5b8',
    border: '2px solid #8b5a2b',
    borderRadius: '2px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    position: 'relative',
    zIndex: 1,
  },
  door: {
    width: 16,
    height: 24,
    backgroundColor: '#8b5a2b',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
  },
}
