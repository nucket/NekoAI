import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AnnouncementContent } from '../components/SpeechBubble'
import { useConfigStore } from '../store/configStore'
import { t } from '../i18n'

// Give startup (onboarding, the Wayland notice, the first chat) room before
// asking github.com whether there is a newer release.
const CHECK_DELAY_MS = 15_000
const RELEASES_URL = 'https://github.com/nucket/NekoAI/releases/latest'

/** What `check_for_update` (src-tauri/src/updater.rs) reports. */
interface UpdateInfo {
  version: string
  /** False for portable copies and Linux .deb / .rpm installs. */
  canInstall: boolean
}

export interface UseUpdateNoticeOptions {
  /** True while something else owns the window (onboarding, bubble, panel, alert). */
  busy: boolean
  setAnnouncement: (content: AnnouncementContent | null) => void
  openBubble: () => Promise<void>
  closeBubble: () => Promise<void>
}

/**
 * Checks for a new release once per launch (unless turned off in Settings)
 * and, when there is one, offers it in the pet's bubble. Nothing is
 * downloaded until the user says so.
 */
export function useUpdateNotice({
  busy,
  setAnnouncement,
  openBubble,
  closeBubble,
}: UseUpdateNoticeOptions) {
  const isLoaded = useConfigStore((s) => s.isLoaded)
  const enabled = useConfigStore((s) => s.config.checkUpdates !== false)
  const [found, setFound] = useState<UpdateInfo | null>(null)
  const checkedRef = useRef(false)
  const shownRef = useRef(false)

  useEffect(() => {
    if (!isLoaded || !enabled || checkedRef.current) return
    const timer = setTimeout(() => {
      checkedRef.current = true
      invoke<UpdateInfo | null>('check_for_update')
        .then((info) => {
          if (info) setFound(info)
        })
        // Offline, rate-limited or no release metadata yet: try next launch.
        .catch((err) => console.warn('[NekoAI] update check failed:', err))
    }, CHECK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isLoaded, enabled])

  useEffect(() => {
    if (!found || busy || shownRef.current) return
    shownRef.current = true

    const dismiss = () => {
      setAnnouncement(null)
      void closeBubble()
    }
    const later = { label: t('update.later'), onClick: dismiss }
    const install = () => {
      setAnnouncement({ text: t('update.installing'), actions: [] })
      // On success the app restarts (or, on Windows, the installer closes it).
      invoke('install_update').catch((err) =>
        setAnnouncement({
          text: t('update.failed', { error: String(err) }),
          actions: [{ label: t('common.gotIt'), onClick: dismiss }],
        })
      )
    }

    setAnnouncement(
      found.canInstall
        ? {
            text: t('update.available', { version: found.version }),
            actions: [{ label: t('update.install'), primary: true, onClick: install }, later],
          }
        : {
            text: t('update.availableManual', { version: found.version }),
            actions: [
              {
                label: t('update.download'),
                primary: true,
                onClick: () => {
                  invoke('open_url', { url: RELEASES_URL }).catch(console.error)
                  dismiss()
                },
              },
              later,
            ],
          }
    )
    void openBubble()
  }, [found, busy, setAnnouncement, openBubble, closeBubble])
}
