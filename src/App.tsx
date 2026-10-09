import { useState, useMemo, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { PetRenderer } from './pets/PetRenderer'
import type { PetDefinition } from './types/pet'
import { usePetMovement } from './hooks/usePetMovement'
import { SpeechBubble } from './components/SpeechBubble'
import { SettingsPanel } from './components/SettingsPanel'
import { PetSelector } from './components/PetSelector'
import { useConfigStore } from './store/configStore'
import { useDesktopContext } from './hooks/useDesktopContext'
import { useMoodEngine } from './hooks/useMoodEngine'
import { useIdleSequencer, type IdleSequencerCues } from './hooks/useIdleSequencer'
import { usePetTriggers } from './hooks/usePetTriggers'
import { useOnboarding } from './hooks/useOnboarding'
import { useOnboardingSequence } from './hooks/useOnboardingSequence'
import { usePetDefinition, DEFAULT_PET_ID } from './hooks/usePetDefinition'
import { useCursorTracking } from './hooks/useCursorTracking'
import { useEdgeAnimation } from './hooks/useEdgeAnimation'
import { useBubbleWindow } from './hooks/useBubbleWindow'
import { useTimedValue } from './hooks/useTimedValue'
import { useAppEvents } from './hooks/useAppEvents'
import { useLinuxExpandedChrome } from './hooks/useLinuxExpandedChrome'
import { useWaylandNotice } from './hooks/useWaylandNotice'
import { useChat } from './hooks/useChat'
import { IS_LINUX } from './utils/platform'
import { openContextMenu } from './utils/contextMenu'
import { resolveAnimation } from './pets/resolveAnimation'
import { flashDurationMs, triggerAnimation } from './pets/triggers'
import { BUBBLE_WIN_H, BUBBLE_WIN_W, DEFAULT_PET_SIZE } from './constants/layout'
import './App.css'

// How long the pet stays at a notifying window before resuming.
const NOTIFICATION_ALERT_MS = 5000
// Length of the optional 'awaken' flash before the bubble opens on click.
const CLICK_WAKE_MS = 350

export default function App() {
  const { config, isLoaded, loadConfig, setActivePetId } = useConfigStore()
  const spriteSize = config.petSize ?? DEFAULT_PET_SIZE
  const spriteInsetX = Math.round((BUBBLE_WIN_W - spriteSize) / 2)
  const activePetId = config.activePetId || DEFAULT_PET_ID

  useEffect(() => {
    if (!isLoaded) loadConfig()
  }, [isLoaded, loadConfig])

  // Settings and the pet selector take over the main window; the context
  // menu lives in its own window, so the sprite stays free to move.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [petSelectorOpen, setPetSelectorOpen] = useState(false)
  const anyPanelOpen = settingsOpen || petSelectorOpen
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const openPetSelector = useCallback(() => setPetSelectorOpen(true), [])

  const { petDef, spritesDir } = usePetDefinition(activePetId)
  const cursorTracking = useCursorTracking()
  const availableAnimationsList = useMemo(
    () => (petDef ? Object.keys(petDef.animations || {}) : []),
    [petDef]
  )
  const animations = useMemo<PetDefinition['animations']>(() => petDef?.animations ?? {}, [petDef])

  const { edgeAnimOverride, setEdgeAnimOverride, handleEdgeAnimation } = useEdgeAnimation(petDef)
  const bubble = useBubbleWindow()
  const { bubbleOpen, bubblePos } = bubble
  const notification = useTimedValue<boolean>()
  const notificationAlert = notification.value === true
  const clickWake = useTimedValue<string>()

  // ── Movement ───────────────────────────────────────────────────────────────
  // Cursor following is paused for the entire onboarding sequence. When the
  // cursor cannot be tracked (Wayland with no input-device access) the pet
  // falls back to wandering so it still feels alive.
  const onboarding = useOnboarding()
  const onboardingActive = onboarding.state !== 'done'
  const userMode: 'buddy' | 'wanderer' = config.petMode ?? 'buddy'
  const effectiveMode = cursorTracking === 'unavailable' ? 'wanderer' : userMode

  const { petState, currentAnimation, overridePosition } = usePetMovement({
    nearThreshold: 50,
    sleepTimeout: 10 * 60 * 1000, // sequencer handles sleep at 5 min; this is a safety fallback
    windowSize: spriteSize,
    enabled:
      !bubble.dragging && !bubbleOpen && !anyPanelOpen && !notificationAlert && !onboardingActive,
    mode: effectiveMode,
    availableAnimations: availableAnimationsList,
    onEdgeAnimation: handleEdgeAnimation,
  })

  const showNotification = notification.show
  const onNotification = useCallback(
    () => showNotification(true, NOTIFICATION_ALERT_MS),
    [showNotification]
  )
  useAppEvents({ spriteSize, overridePosition, openSettings, openPetSelector, onNotification })

  // ── Resize OS window when pet size changes ────────────────────────────────
  // Panels and bubble have their own resize logic; guard them here so they
  // are not disrupted when the store updates mid-session.
  useEffect(() => {
    if (!isLoaded || bubbleOpen || settingsOpen || petSelectorOpen) return
    invoke('resize_window', { width: spriteSize, height: spriteSize }).catch(console.error)
  }, [spriteSize, isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useLinuxExpandedChrome(bubbleOpen || anyPanelOpen)

  // ── Mood, triggers and the idle sequencer ─────────────────────────────────
  const { appCategory, idleMinutes } = useDesktopContext()
  const { moodOverride } = useMoodEngine({ idleMinutes, appCategory, petState })
  const { triggerAnim, fire: fireTrigger, setAiThinking } = usePetTriggers({ petDef, idleMinutes })

  const sequencerCues = useMemo<IdleSequencerCues>(() => {
    const greet = triggerAnimation(petDef, 'on_cursor_near')
    return {
      greet: greet ? { anim: greet, durationMs: flashDurationMs(petDef?.animations[greet]) } : null,
      wake: triggerAnimation(petDef, 'on_movement_start'),
    }
  }, [petDef])
  const idleAnim = useIdleSequencer(petState, availableAnimationsList, sequencerCues)

  // ── Chat ───────────────────────────────────────────────────────────────────
  const onAiResponse = useCallback(() => fireTrigger('on_ai_response'), [fireTrigger])
  const chat = useChat({ petDef, onThinkingChange: setAiThinking, onResponse: onAiResponse })

  // ── First-launch onboarding and the Wayland notice ────────────────────────
  useOnboardingSequence({
    onboarding,
    availableAnimations: availableAnimationsList,
    overridePosition,
    setEdgeAnimOverride,
    setAnnouncement: bubble.setAnnouncement,
    openBubble: bubble.openBubble,
    closeBubble: bubble.closeBubble,
    openSettings,
  })

  useWaylandNotice({
    cursorTracking,
    busy: onboardingActive || bubbleOpen || anyPanelOpen || notificationAlert,
    setAnnouncement: bubble.setAnnouncement,
    openBubble: bubble.openBubble,
    closeBubble: bubble.closeBubble,
  })

  // ── Interaction handlers ───────────────────────────────────────────────────
  const { openBubble } = bubble
  const showClickWake = clickWake.show
  const handleSpriteClick = useCallback(() => {
    if (bubbleOpen || settingsOpen) return

    const open = () => {
      fireTrigger('on_chat_open')
      void openBubble()
    }
    if (Math.random() < 0.4 && availableAnimationsList.includes('awaken')) {
      showClickWake('awaken', CLICK_WAKE_MS, open)
    } else {
      open()
    }
  }, [bubbleOpen, settingsOpen, openBubble, availableAnimationsList, fireTrigger, showClickWake])

  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (bubbleOpen || settingsOpen || petSelectorOpen) return
      void openContextMenu()
    },
    [bubbleOpen, settingsOpen, petSelectorOpen]
  )

  // ── Sprite position when bubble is open ────────────────────────────────────
  const spriteStyle = bubbleOpen
    ? ({
        position: 'absolute' as const,
        width: spriteSize,
        height: spriteSize,
        left: spriteInsetX,
        top: bubblePos === 'above' ? BUBBLE_WIN_H - spriteSize : 0,
      } as React.CSSProperties)
    : undefined

  // Container size must match petSize exactly to avoid a visible border/gap.
  // While the bubble is open the window is sized by .app-container--open; on
  // Linux it additionally needs an opaque dark fill to mask the magenta
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
        onClose={bubble.closeBubble}
        onSendMessage={chat.sendMessage}
        loadHistory={chat.loadHistory}
        announcement={bubble.announcement ?? undefined}
      />

      {/* Hide sprite while any panel occupies the window so it doesn't
          leak into the transparent area behind the menu/settings card */}
      {!anyPanelOpen && (
        <div
          className="sprite-container"
          style={spriteStyle ?? containerStyle}
          onClick={handleSpriteClick}
          onMouseDown={bubble.startDrag}
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
                clickWakeAnim: clickWake.value,
                triggerAnim,
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
