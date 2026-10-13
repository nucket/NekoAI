import { useEffect, useRef } from 'react'
import type { AnnouncementContent } from '../components/SpeechBubble'
import type { CursorTracking } from './useCursorTracking'
import { t } from '../i18n'

const SEEN_KEY = 'nekoai.waylandCursorNoticeSeen'
const ENABLE_CMD = 'sudo usermod -aG input $USER'

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
      const baseText = `${t('wayland.notice')}\n\n${ENABLE_CMD}`
      const dismiss = {
        label: t('common.gotIt'),
        onClick: () => {
          setAnnouncement(null)
          void closeBubble()
        },
      }
      setAnnouncement({
        text: baseText,
        actions: [
          {
            label: t('wayland.copy'),
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
                  text: `${baseText}\n\n${t('wayland.copied')}`,
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
