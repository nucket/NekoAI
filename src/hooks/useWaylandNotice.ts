import { useEffect, useRef } from 'react'
import type { AnnouncementContent } from '../components/SpeechBubble'
import type { CursorTracking } from './useCursorTracking'

const SEEN_KEY = 'nekoai.waylandCursorNoticeSeen'
const ENABLE_CMD = 'sudo usermod -aG input $USER'
const BASE_TEXT =
  "Heads-up — I'm on Wayland, so I can't follow your mouse around the desktop. I'll roam on my own instead! To let me follow your cursor, add yourself to the `input` group and log out / back in:"

export interface UseWaylandNoticeOptions {
  cursorTracking: CursorTracking
  /** True while something else owns the window (onboarding, bubble, panel, alert). */
  busy: boolean
  setAnnouncement: (content: AnnouncementContent | null) => void
  openBubble: () => Promise<void>
  closeBubble: () => Promise<void>
}

/**
 * When real cursor following is impossible the pet runs in wanderer mode;
 * explain that once, in the pet's own voice, so the behaviour isn't a mystery.
 * Waits until the window is free so two bubbles never collide, and is shown at
 * most once ever (persisted in localStorage).
 */
export function useWaylandNotice({
  cursorTracking,
  busy,
  setAnnouncement,
  openBubble,
  closeBubble,
}: UseWaylandNoticeOptions) {
  const shownRef = useRef(false)

  useEffect(() => {
    if (cursorTracking !== 'unavailable') return
    if (busy) return
    if (shownRef.current) return
    if (localStorage.getItem(SEEN_KEY) === '1') return

    shownRef.current = true
    void (async () => {
      localStorage.setItem(SEEN_KEY, '1')
      const dismiss = {
        label: 'Got it',
        onClick: () => {
          setAnnouncement(null)
          void closeBubble()
        },
      }
      setAnnouncement({
        text: `${BASE_TEXT}\n\n${ENABLE_CMD}`,
        actions: [
          {
            label: '📋 Copy fix command',
            primary: true,
            onClick: () => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(ENABLE_CMD)
                } catch {
                  // Clipboard may be denied by the browser/WebView — ignore;
                  // the command is already visible in the bubble text.
                }
                setAnnouncement({
                  text: `${BASE_TEXT}\n\n${ENABLE_CMD}\n\n✓ Copied — log out and back in for it to take effect.`,
                  actions: [dismiss],
                })
              })()
            },
          },
          dismiss,
        ],
      })
      await openBubble()
    })()
  }, [cursorTracking, busy, setAnnouncement, closeBubble, openBubble])
}
