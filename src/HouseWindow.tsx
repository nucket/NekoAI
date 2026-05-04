import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { listen } from '@tauri-apps/api/event'
import { useConfigStore } from './store/configStore'

const HOUSE_SIZE = 64

export function HouseWindow() {
  const [placed, setPlaced] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const [housePos, setHousePos] = useState<{ x: number; y: number } | null>(null)

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
        const monitor = await currentMonitor()
        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
        const monW = monitor?.size.width ?? window.screen.availWidth * scale
        const monH = monitor?.size.height ?? window.screen.availHeight * scale
        const monX = monitor?.position.x ?? 0
        const monY = monitor?.position.y ?? 0

        const win = getCurrentWindow()
        const margin = 20 * scale
        const x = monX + monW - HOUSE_SIZE * scale - margin
        const y = monY + monH - HOUSE_SIZE * scale - margin

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
          src={`/pets/${activePetId}/house.png`}
          width={HOUSE_SIZE}
          height={HOUSE_SIZE}
          style={styles.img}
          onError={() => setImgFailed(true)}
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
