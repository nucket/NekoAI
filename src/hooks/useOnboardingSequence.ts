import { useCallback, useEffect, useRef } from 'react'
import { currentMonitor } from '@tauri-apps/api/window'
import type { AnnouncementContent } from '../components/SpeechBubble'
import type { useOnboarding } from './useOnboarding'
import { useConfigStore } from '../store/configStore'
import { DEFAULT_PET_SIZE, HOUSE_SIZE } from '../constants/layout'
import { workAreaOf } from '../utils/monitor'

// Onboarding bubble stays up at most this long; user can close earlier via
// the action buttons. After it closes, regular cursor-following resumes.
const ONBOARDING_AUTOCLOSE_MS = 10_000

// "Walk out of the house" slide duration. Pet starts at the house corner
// (bottom-right) and slides left to monitor center-bottom over this period.
const ONBOARDING_SLIDE_MS = 5500

export interface UseOnboardingSequenceOptions {
  onboarding: ReturnType<typeof useOnboarding>
  availableAnimations: string[]
  overridePosition: (x: number, y: number) => void
  setEdgeAnimOverride: (anim: string | null) => void
  setAnnouncement: (content: AnnouncementContent | null) => void
  openBubble: () => Promise<void>
  closeBubble: () => Promise<void>
  openSettings: () => void
}

/**
 * First-launch sequence. Cursor following stays paused meanwhile (App passes
 * `onboarding.state !== 'done'` to usePetMovement):
 *   1. Teleport pet just left of the house (bottom-right corner).
 *   2. Slide horizontally to monitor center-bottom while playing walk_left.
 *   3. Show the announcement bubble (CTA for needs_setup, celebratory for
 *      ollama_found). Auto-closes after ONBOARDING_AUTOCLOSE_MS or on user
 *      action — whichever comes first.
 *   4. After close, `onboarding.dismiss()` flips state to 'done' and the
 *      regular movement hook takes over (cursor following resumes).
 */
export function useOnboardingSequence({
  onboarding,
  availableAnimations,
  overridePosition,
  setEdgeAnimOverride,
  setAnnouncement,
  openBubble,
  closeBubble,
  openSettings,
}: UseOnboardingSequenceOptions) {
  const autocloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closeOnboardingBubble = useCallback(
    (thenOpenSettings: boolean) => {
      if (autocloseRef.current) {
        clearTimeout(autocloseRef.current)
        autocloseRef.current = null
      }
      setAnnouncement(null)
      void closeBubble().then(() => {
        if (thenOpenSettings) openSettings()
      })
      onboarding.dismiss()
    },
    [closeBubble, onboarding, setAnnouncement, openSettings]
  )

  useEffect(() => {
    if (onboarding.state !== 'needs_setup' && onboarding.state !== 'ollama_found') return

    let cancelled = false

    void (async () => {
      try {
        const monitor = await currentMonitor()
        const scale = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1
        // Work area, not full monitor bounds: the bottom edge already sits
        // above the taskbar / dock, matching where HouseWindow places itself.
        const { x: monX, y: monY, width: monW, height: monH } = workAreaOf(monitor)
        const sz = useConfigStore.getState().config.petSize ?? DEFAULT_PET_SIZE

        const houseW = HOUSE_SIZE * scale
        const bottomY = Math.round(monY + monH - sz * scale)
        // Pet starts immediately to the left of the house with a small gap.
        const startX = Math.round(monX + monW - houseW - sz * scale - 8 * scale)
        // Target = horizontally centred on the active monitor, same Y line.
        const targetX = Math.round(monX + monW / 2 - (sz * scale) / 2)

        // 1. Teleport to "exiting house" pose.
        overridePosition(startX, bottomY)
        if (availableAnimations.includes('walk_left')) setEdgeAnimOverride('walk_left')

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

        setAnnouncement(announcement)
        void openBubble()

        // 4. Autoclose after ONBOARDING_AUTOCLOSE_MS — same path as a click.
        autocloseRef.current = setTimeout(
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
      if (autocloseRef.current) {
        clearTimeout(autocloseRef.current)
        autocloseRef.current = null
      }
      setEdgeAnimOverride(null)
    }
    // Runs once per onboarding phase; the callbacks are stable or read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding.state, onboarding.detectedModel])
}
