import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { PetRenderer } from './pets/PetRenderer'
import type { PetDefinition } from './types/pet'
import { usePetMovement } from './hooks/usePetMovement'
import { SpeechBubble, type AnnouncementContent } from './components/SpeechBubble'
import { SettingsPanel } from './components/SettingsPanel'
import { PetSelector } from './components/PetSelector'
import { useConfigStore } from './store/configStore'
import { useAppStore } from './store'
import { createAIProvider, buildContextBlock } from './ai'
import { loadFacts, extractAndSaveFacts } from './ai/memory'
import { useDesktopContext } from './hooks/useDesktopContext'
import { useMoodEngine } from './hooks/useMoodEngine'
import { useIdleSequencer } from './hooks/useIdleSequencer'
import { useOnboarding } from './hooks/useOnboarding'
import { IS_LINUX } from './utils/platform'
import './App.css'

// Onboarding bubble stays up at most this long; user can close earlier via
// the action buttons. After it closes, regular cursor-following resumes.
const ONBOARDING_AUTOCLOSE_MS = 10_000

// "Walk out of the house" slide duration. Pet starts at the house corner
// (bottom-right) and slides left to monitor center-bottom over this period.
const ONBOARDING_SLIDE_MS = 5500

// ─── Layout constants ──────────────────────────────────────────────────────────

const WIN_OPEN_W = 300
const WIN_OPEN_H = 300

// ─── Animation resolver ───────────────────────────────────────────────────────
// Single source of truth for which sprite plays, with two firm rules:
//   1. notificationAlert always wins (pet was teleported to notify the user).
//   2. While WALKING, the directional walk_* animation is sacred — only the
//      edge-hit scratch override is allowed (classic Neko "scratches the wall"
//      behaviour). Idle sequencer / mood / wake flashes never pre-empt a walk.

interface ResolveAnimationArgs {
  petState: 'IDLE' | 'WALKING' | 'NEAR_CURSOR' | 'SLEEPING'
  notificationAlert: boolean
  hasAlert: boolean
  edgeAnimOverride: string | null
  clickWakeAnim: string | null
  idleAnim: string | null
  moodOverride: string | null
  currentAnimation: string
}

function resolveAnimation({
  petState,
  notificationAlert,
  hasAlert,
  edgeAnimOverride,
  clickWakeAnim,
  idleAnim,
  moodOverride,
  currentAnimation,
}: ResolveAnimationArgs): string {
  if (notificationAlert) return hasAlert ? 'alert' : 'idle'
  if (petState === 'WALKING') return edgeAnimOverride ?? currentAnimation
  return edgeAnimOverride ?? clickWakeAnim ?? idleAnim ?? moodOverride ?? currentAnimation
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { config, isLoaded, loadConfig, setActivePetId } = useConfigStore()
  const spriteSize = config.petSize ?? 32
  const spriteInsetX = Math.round((WIN_OPEN_W - spriteSize) / 2)

  useEffect(() => {
    if (!isLoaded) loadConfig()
  }, [isLoaded, loadConfig])

  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [bubblePos, setBubblePos] = useState<'above' | 'below'>('above')
  const [dragging, setDragging] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingAnnouncement, setOnboardingAnnouncement] = useState<AnnouncementContent | null>(
    null
  )
  const onboardingAutocloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [petSelectorOpen, setPetSelectorOpen] = useState(false)
  const [notificationAlert, setNotificationAlert] = useState(false)
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clickWakeAnim, setClickWakeAnim] = useState<string | null>(null)
  const clickWakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [edgeAnimOverride, setEdgeAnimOverride] = useState<string | null>(null)
  const edgeAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activePetId = config.activePetId || 'classic-neko'
  // Context menu lives in a separate Tauri window — the main window never
  // gets taken over, so the sprite stays free to follow the cursor.
  const anyPanelOpen = settingsOpen || petSelectorOpen

  // ── Pet definition loaded from disk ────────────────────────────────────────
  const [petDef, setPetDef] = useState<PetDefinition | null>(null)
  const [spritesDir, setSpritesDir] = useState<string>('')

  const savedPos = useRef<{ x: number; y: number } | null>(null)

  // ── Load pet.json whenever activePetId changes ────────────────────────────
  // pets/ is served as static HTTP assets by Vite (dev) and bundled into
  // dist/pets/ by the vite.config build hook (production). No Tauri fs APIs needed.
  useEffect(() => {
    async function loadPet() {
      try {
        const res = await fetch(`/pets/${activePetId}/pet.json`)
        if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.url}`)

        const def: PetDefinition = await res.json()
        const spritesPath = `/pets/${activePetId}/${def.spritesDir}`

        setPetDef(def)
        setSpritesDir(spritesPath)
      } catch (err) {
        console.error('[NekoAI] loadPet failed:', err)
      }
    }
    loadPet()
  }, [activePetId])

  // ── Movement ───────────────────────────────────────────────────────────────
  const availableAnimationsList = useMemo(
    () => (petDef ? Object.keys(petDef.animations || {}) : []),
    [petDef]
  )

  // Edge animation dispatcher — invoked by the movement hook's edge state
  // machine. Resolves the right sprite for each phase and pushes it through
  // edgeAnimOverride for `durationMs`. The pet is frozen on the movement side
  // for the same duration, so animation and position stay in sync.
  const handleEdgeAnimation = useCallback(
    (
      kind: 'scratch' | 'yawn' | 'idle',
      direction: 'right' | 'left' | 'up' | 'down',
      durationMs: number
    ) => {
      if (!petDef) return
      let animName: string | null = null
      if (kind === 'scratch') {
        const triggerKey = `on_edge_hit_${direction}` as const
        animName = petDef.triggers?.[triggerKey] ?? null
      } else if (kind === 'yawn') {
        animName = petDef.animations?.yawn ? 'yawn' : null
      } else if (kind === 'idle') {
        animName = 'idle'
      }
      if (!animName || !petDef.animations?.[animName]) return

      setEdgeAnimOverride(animName)
      if (edgeAnimTimerRef.current) clearTimeout(edgeAnimTimerRef.current)
      edgeAnimTimerRef.current = setTimeout(() => setEdgeAnimOverride(null), durationMs)
    },
    [petDef]
  )

  // ── First-launch onboarding ────────────────────────────────────────────────
  // Declared here (before usePetMovement) so the movement hook can disable
  // cursor following while the onboarding sequence runs.
  const onboarding = useOnboarding()

  // Cursor following is paused for the entire onboarding sequence (detection
  // ping, slide-out from house, announcement bubble, autoclose). Once the
  // user dismisses or the timeout fires, `onboarding.state` flips to 'done'
  // and the regular movement state machine takes over.
  const onboardingActive = onboarding.state !== 'done'

  const { petState, currentAnimation, overridePosition } = usePetMovement({
    nearThreshold: 50,
    sleepTimeout: 10 * 60 * 1000, // sequencer handles sleep at 5 min; this is a safety fallback
    windowSize: spriteSize,
    enabled: !dragging && !bubbleOpen && !anyPanelOpen && !notificationAlert && !onboardingActive,
    mode: config.petMode ?? 'buddy',
    availableAnimations: availableAnimationsList,
    onEdgeAnimation: handleEdgeAnimation,
  })

  // ── Tray event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const unlisteners = Promise.all([
      listen('tray-settings', () => setSettingsOpen(true)),
      listen<string>('tray-select-pet', (e) => {
        useConfigStore.getState().setActivePetId(e.payload)
        setPetSelectorOpen(true)
      }),
      listen('tray-quit', () => invoke('quit_app')),

      // Actions emitted from the secondary panel window (context menu)
      listen<string>('panel-action', (e) => {
        const action = e.payload
        if (action === 'settings') {
          setSettingsOpen(true)
        } else if (action === 'select-pet') {
          setPetSelectorOpen(true)
        } else if (action.startsWith('pet-size:')) {
          const size = parseInt(action.split(':')[1], 10)
          if (!isNaN(size)) useConfigStore.getState().setPetSize(size)
        } else if (action.startsWith('pet-mode:')) {
          const m = action.split(':')[1] as 'buddy' | 'wanderer'
          if (m === 'buddy' || m === 'wanderer') useConfigStore.getState().setPetMode(m)
        } else if (action.startsWith('house_pos:')) {
          const [xStr, yStr] = action.split(':')[1].split(',')
          const x = parseInt(xStr, 10)
          const y = parseInt(yStr, 10)
          if (!isNaN(x) && !isNaN(y)) {
            const scale = window.devicePixelRatio || 1
            // Position pet to the left of the house with a 4-px physical gap
            overridePosition(x - spriteSize * scale - Math.round(4 * scale), y)
          }
        }
      }),

      // Notification alert from background monitor
      listen<{
        title: string
        process_name: string
        rect: { x: number; y: number; width: number; height: number }
      }>('neko-notification', async (e) => {
        try {
          const monitor = await currentMonitor()
          const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
          const monH = monitor?.size.height ?? window.screen.height * scale
          const monX = monitor?.position.x ?? 0
          const monW = monitor?.size.width ?? window.screen.width * scale
          const monY = monitor?.position.y ?? 0

          // Approximate taskbar height: 48 logical px
          const taskbarH = 48 * scale
          const sz = useConfigStore.getState().config.petSize ?? 32

          // Target Y: just above the taskbar
          const targetY = monY + monH - taskbarH - sz * scale

          // Target X: center of the notifying window (rect may be in logical px → scale)
          const windowCenterX = (e.payload.rect.x + e.payload.rect.width / 2) * scale
          const targetX = Math.max(monX, Math.min(monX + monW - sz * scale, windowCenterX))

          overridePosition(Math.round(targetX), Math.round(targetY))

          if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
          setNotificationAlert(true)

          notificationTimerRef.current = setTimeout(() => {
            setNotificationAlert(false)
          }, 5000)
        } catch {
          // silently skip if positioning fails
        }
      }),
    ])
    return () => {
      unlisteners.then((fns) => fns.forEach((fn) => fn()))
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
      if (clickWakeTimerRef.current) clearTimeout(clickWakeTimerRef.current)
      if (edgeAnimTimerRef.current) clearTimeout(edgeAnimTimerRef.current)
    }
  }, [overridePosition, spriteSize])

  // ── Resize OS window when pet size changes ────────────────────────────────
  // Panels and bubble have their own resize logic; guard them here so they
  // are not disrupted when the store updates mid-session.
  useEffect(() => {
    if (!isLoaded || bubbleOpen || settingsOpen || petSelectorOpen) return
    invoke('resize_window', { width: spriteSize, height: spriteSize }).catch(console.error)
  }, [spriteSize, isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Expanded-state lifecycle (bubble, settings, pet selector) ──────────────
  // On Linux, where the window is opaque with a magenta chroma-key fill, any
  // of these expanded states grow the window past sprite size, so:
  //   1. The sprite-sized GTK shape mask must be cleared — otherwise the
  //      panel UI is clipped to a tiny rectangle in the window's top-left.
  //   2. The body's chroma-key magenta fill must be swapped for a dark fill
  //      so we don't see magenta peek through the panel's edges/corners.
  // On collapse, the sprite remounts and PetRenderer re-pushes the shape on
  // the next animation frame, and the chroma-key class comes back.
  // On Windows / macOS the window is natively transparent — no chroma-key
  // toggling, no shape clearing, and no dark fill: only the speech bubble and
  // sprite show. The dark fill is Linux-only and applied inline (see below).
  useEffect(() => {
    if (!IS_LINUX) return
    const isExpanded = bubbleOpen || anyPanelOpen
    document.body.classList.toggle('chroma-key', !isExpanded)
    document.body.classList.toggle('panel-bg', isExpanded)
    if (isExpanded) {
      invoke('clear_window_shape').catch(() => {})
    }
  }, [bubbleOpen, anyPanelOpen])

  // ── Animations from pet.json, fallback to empty while loading ─────────────
  const animations = useMemo<PetDefinition['animations']>(() => petDef?.animations ?? {}, [petDef])

  // ── Desktop context (idle time, active app) ───────────────────────────────
  const { appCategory, idleMinutes } = useDesktopContext()

  // ── Mood engine (updates store + emits animation overrides) ──────────────
  const { moodOverride } = useMoodEngine({ idleMinutes, appCategory, petState })

  // ── Idle sequencer — nkosrc4 stop/groom/sleep state machine ──────────────
  const idleAnim = useIdleSequencer(petState, availableAnimationsList)

  // ── AI send with persistent memory ────────────────────────────────────────
  const handleSendMessage = useCallback(async (text: string): Promise<string> => {
    const { config: cfg } = useConfigStore.getState()

    if (!cfg.apiKey && cfg.provider !== 'ollama') {
      return 'Nyaa~ I need an API key to talk! Set one in Settings 🐾'
    }

    try {
      await invoke('save_message', { role: 'user', content: text })

      const [history, facts] = await Promise.all([
        invoke<Array<{ role: string; content: string }>>('get_recent_messages', { limit: 20 }),
        loadFacts(),
      ])

      const mood = useAppStore.getState().mood
      const systemPrompt = buildContextBlock('NekoAI', facts, mood)
      const provider = createAIProvider(cfg)
      const messages = history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const reply = await provider.sendMessage(messages, systemPrompt)

      await invoke('save_message', { role: 'assistant', content: reply })
      extractAndSaveFacts(text, reply)

      return reply
    } catch (err) {
      console.error('[NekoAI] handleSendMessage error:', err)
      return 'Sorry, something went wrong. 😿'
    }
  }, [])

  // ── Open bubble ────────────────────────────────────────────────────────────
  const openBubble = useCallback(async () => {
    const win = getCurrentWindow()
    const [pos, monitor] = await Promise.all([win.outerPosition(), currentMonitor()])

    const sz = useConfigStore.getState().config.petSize ?? 32
    const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1

    // Physical bounds of the active monitor
    const monX = monitor?.position.x ?? 0
    const monY = monitor?.position.y ?? 0
    const monW = monitor?.size.width ?? window.screen.availWidth * scale
    const monH = monitor?.size.height ?? window.screen.availHeight * scale

    // Physical sizes
    const openPhysW = WIN_OPEN_W * scale
    const openPhysH = WIN_OPEN_H * scale
    const insetPhysX = Math.round(((WIN_OPEN_W - sz) / 2) * scale)

    // Bubble above or below based on position within the active monitor
    const side: 'above' | 'below' = pos.y - monY > monH / 2 ? 'above' : 'below'

    // Save original sprite physical position to restore on close
    savedPos.current = { x: pos.x, y: pos.y }
    setBubblePos(side)
    setBubbleOpen(true)

    // Expanded window position: keep sprite visually in place
    let newX = pos.x - insetPhysX
    let newY = side === 'above' ? pos.y - Math.round((WIN_OPEN_H - sz) * scale) : pos.y

    // Clamp inside the active monitor
    newX = Math.max(monX, Math.min(newX, monX + monW - openPhysW))
    newY = Math.max(monY, Math.min(newY, monY + monH - openPhysH))

    await win.setPosition(new PhysicalPosition(Math.round(newX), Math.round(newY)))
    await invoke('resize_window', { width: WIN_OPEN_W, height: WIN_OPEN_H })
    // Note: clearing the GTK shape mask is centralised in the expanded-state
    // useEffect above so all three expand paths (bubble, settings, pet
    // selector) share the same lifecycle.
  }, [])

  // ── Close bubble ───────────────────────────────────────────────────────────
  const closeBubble = useCallback(async () => {
    setBubbleOpen(false)
    const win = getCurrentWindow()
    if (savedPos.current) {
      const { x, y } = savedPos.current // physical coords
      const sz = useConfigStore.getState().config.petSize ?? 32
      await invoke('resize_window', { width: sz, height: sz })
      await win.setPosition(new PhysicalPosition(x, y))
      savedPos.current = null
    }
  }, [])

  // ── Onboarding sequence ────────────────────────────────────────────────────
  // Cursor following stays paused via `onboardingActive` (see usePetMovement
  // above). Sequence:
  //   1. Teleport pet just left of the house (bottom-right corner).
  //   2. Slide horizontally to monitor center-bottom while playing walk_left.
  //   3. Show the announcement bubble (CTA for needs_setup, celebratory for
  //      ollama_found). Auto-closes after ONBOARDING_AUTOCLOSE_MS or on user
  //      action — whichever comes first.
  //   4. After close, `onboarding.dismiss()` flips state to 'done' and the
  //      regular movement hook takes over (cursor following resumes).
  const closeOnboardingBubble = useCallback(
    (openSettings: boolean) => {
      if (onboardingAutocloseRef.current) {
        clearTimeout(onboardingAutocloseRef.current)
        onboardingAutocloseRef.current = null
      }
      setOnboardingAnnouncement(null)
      void closeBubble().then(() => {
        if (openSettings) setSettingsOpen(true)
      })
      onboarding.dismiss()
    },
    [closeBubble, onboarding]
  )

  useEffect(() => {
    if (onboarding.state !== 'needs_setup' && onboarding.state !== 'ollama_found') return

    let cancelled = false

    void (async () => {
      try {
        const monitor = await currentMonitor()
        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
        const monX = monitor?.position.x ?? 0
        const monY = monitor?.position.y ?? 0
        const monW = monitor?.size.width ?? window.screen.width * scale
        const monH = monitor?.size.height ?? window.screen.height * scale
        const sz = useConfigStore.getState().config.petSize ?? 32

        // Same approximations the notification handler uses.
        const taskbarH = 48 * scale
        const houseW = 64 * scale
        const bottomY = Math.round(monY + monH - taskbarH - sz * scale)
        // Pet starts immediately to the left of the house with a small gap.
        const startX = Math.round(monX + monW - houseW - sz * scale - 8 * scale)
        // Target = horizontally centred on the active monitor, same Y line.
        const targetX = Math.round(monX + monW / 2 - (sz * scale) / 2)

        // 1. Teleport to "exiting house" pose.
        overridePosition(startX, bottomY)
        const hasWalkLeft = availableAnimationsList.includes('walk_left')
        if (hasWalkLeft) setEdgeAnimOverride('walk_left')

        // 2. Slide horizontally over ONBOARDING_SLIDE_MS.
        const t0 = performance.now()
        await new Promise<void>((resolve) => {
          const tick = () => {
            if (cancelled) return resolve()
            const t = Math.min((performance.now() - t0) / ONBOARDING_SLIDE_MS, 1)
            const x = startX + (targetX - startX) * t
            overridePosition(Math.round(x), bottomY)
            if (t < 1) requestAnimationFrame(tick)
            else resolve()
          }
          requestAnimationFrame(tick)
        })
        if (cancelled) return
        setEdgeAnimOverride(null)

        // 3. Build and show the announcement bubble.
        const announcement: AnnouncementContent =
          onboarding.state === 'ollama_found'
            ? {
                text: `Hello! I detected Ollama running and automatically set myself up to use ${
                  onboarding.detectedModel ?? 'your local model'
                }. You can change this in Settings, and right-click me anytime for the menu. Ask me anything!`,
                actions: [
                  { label: 'Got it', primary: true, onClick: () => closeOnboardingBubble(false) },
                  { label: 'Open Settings', onClick: () => closeOnboardingBubble(true) },
                ],
              }
            : {
                text: "Hello! I'm your new desktop pet. To chat with you, I need to be connected to an AI engine. Will you help me set one up? You can also right-click me anytime for the menu.",
                actions: [
                  {
                    label: '⚙ Configure AI',
                    primary: true,
                    onClick: () => closeOnboardingBubble(true),
                  },
                  { label: 'Later', onClick: () => closeOnboardingBubble(false) },
                ],
              }

        setOnboardingAnnouncement(announcement)
        void openBubble()

        // 4. Autoclose after ONBOARDING_AUTOCLOSE_MS — same path as a click.
        onboardingAutocloseRef.current = setTimeout(
          () => closeOnboardingBubble(false),
          ONBOARDING_AUTOCLOSE_MS
        )
      } catch (err) {
        console.error('[onboarding] sequence failed:', err)
        // Don't block the user behind a broken animation — give up cleanly.
        onboarding.dismiss()
      }
    })()

    return () => {
      cancelled = true
      if (onboardingAutocloseRef.current) {
        clearTimeout(onboardingAutocloseRef.current)
        onboardingAutocloseRef.current = null
      }
      setEdgeAnimOverride(null)
    }
    // openBubble/closeBubble are stable (empty deps); onboarding fns from a hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding.state, onboarding.detectedModel])

  // ── Interaction handlers ───────────────────────────────────────────────────
  const handleSpriteClick = useCallback(() => {
    if (bubbleOpen || settingsOpen) return

    const flashAwaken = Math.random() < 0.4 && availableAnimationsList.includes('awaken')

    if (flashAwaken) {
      setClickWakeAnim('awaken')
      if (clickWakeTimerRef.current) clearTimeout(clickWakeTimerRef.current)
      clickWakeTimerRef.current = setTimeout(() => {
        setClickWakeAnim(null)
        openBubble()
      }, 350)
    } else {
      openBubble()
    }
  }, [bubbleOpen, settingsOpen, openBubble, availableAnimationsList])

  const handleRightClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      if (bubbleOpen || settingsOpen || petSelectorOpen) return

      // Position the panel near the cursor on whichever monitor the pet is on,
      // in the opposite quadrant so it never goes off that screen.
      const MENU_W = 190
      const MENU_H = 260
      try {
        const [cursor, monitor] = await Promise.all([
          invoke<{ x: number; y: number }>('get_cursor_pos'),
          currentMonitor(),
        ])

        // Physical bounds of the active monitor (fall back to primary-screen guess)
        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
        const monX = monitor?.position.x ?? 0
        const monY = monitor?.position.y ?? 0
        const monW = monitor?.size.width ?? window.screen.availWidth * scale
        const monH = monitor?.size.height ?? window.screen.availHeight * scale

        // Menu size in physical pixels
        const menuPhysW = MENU_W * scale
        const menuPhysH = MENU_H * scale

        // Quadrant relative to the current monitor
        const openBelow = cursor.y - monY < monH / 2
        const openRight = cursor.x - monX < monW / 2

        // Anchor position (physical) then clamp inside the monitor
        let x = cursor.x + (openRight ? 0 : -menuPhysW)
        let y = cursor.y + (openBelow ? 0 : -menuPhysH)
        x = Math.max(monX, Math.min(x, monX + monW - menuPhysW))
        y = Math.max(monY, Math.min(y, monY + monH - menuPhysH))

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
    },
    [bubbleOpen, settingsOpen, petSelectorOpen]
  )

  const handleMouseDown = useCallback(
    async (e: React.MouseEvent) => {
      if (e.button !== 0 || !bubbleOpen) return
      setDragging(true)
      const win = getCurrentWindow()
      await win.startDragging()
      const resume = async () => {
        const [pos, monitor] = await Promise.all([win.outerPosition(), currentMonitor()])
        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
        const sz = useConfigStore.getState().config.petSize ?? 32
        const insetPhysX = Math.round(((WIN_OPEN_W - sz) / 2) * scale)
        // Sprite physical top-left within the expanded window
        const spritePhysX = pos.x + insetPhysX
        const spritePhysY =
          bubblePos === 'above' ? pos.y + Math.round((WIN_OPEN_H - sz) * scale) : pos.y
        savedPos.current = { x: spritePhysX, y: spritePhysY }
        setDragging(false)
        document.removeEventListener('mouseup', resume)
      }
      document.addEventListener('mouseup', resume, { once: true })
    },
    [bubbleOpen, bubblePos]
  )

  // ── Sprite position when bubble is open ────────────────────────────────────
  const spriteStyle = bubbleOpen
    ? ({
        position: 'absolute' as const,
        width: spriteSize,
        height: spriteSize,
        left: spriteInsetX,
        top: bubblePos === 'above' ? WIN_OPEN_H - spriteSize : 0,
      } as React.CSSProperties)
    : undefined

  // Container size must match petSize exactly to avoid a visible border/gap.
  // While the bubble is open the window is 300×300 (sized by .app-container--open);
  // on Linux it additionally needs an opaque dark fill to mask the magenta
  // chroma-key body. Windows/macOS keep the window natively transparent.
  const containerStyle: React.CSSProperties | undefined = bubbleOpen
    ? IS_LINUX
      ? { background: 'rgb(28, 28, 32)' }
      : undefined
    : { width: spriteSize, height: spriteSize }

  return (
    <div
      className={`app-container${bubbleOpen ? ' app-container--open' : ''}`}
      style={containerStyle}
    >
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <PetSelector
        isOpen={petSelectorOpen}
        activePetId={activePetId}
        onSelect={setActivePetId}
        onClose={() => setPetSelectorOpen(false)}
      />

      <SpeechBubble
        isOpen={bubbleOpen}
        position={bubblePos}
        spriteSize={spriteSize}
        onClose={closeBubble}
        onSendMessage={handleSendMessage}
        announcement={onboardingAnnouncement ?? undefined}
      />

      {/* Hide sprite while any panel occupies the window so it doesn't
          leak into the transparent area behind the menu/settings card */}
      {!anyPanelOpen && (
        <div
          className="sprite-container"
          style={spriteStyle ?? containerStyle}
          onClick={handleSpriteClick}
          onMouseDown={handleMouseDown}
          onContextMenu={handleRightClick}
          data-state={petState}
        >
          {/* Show pet only after sprites are loaded */}
          {spritesDir && Object.keys(animations).length > 0 ? (
            <PetRenderer
              spritesDir={spritesDir}
              currentAnimation={resolveAnimation({
                petState,
                notificationAlert,
                hasAlert: !!animations['alert'],
                edgeAnimOverride,
                clickWakeAnim,
                idleAnim,
                moodOverride,
                currentAnimation,
              })}
              animations={animations}
              displaySize={spriteSize}
              applyWindowShape={!bubbleOpen}
            />
          ) : (
            // Loading indicator while pet.json is being read
            <div
              style={{
                width: spriteSize,
                height: spriteSize,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
              }}
            >
              🐱
            </div>
          )}
        </div>
      )}
    </div>
  )
}
