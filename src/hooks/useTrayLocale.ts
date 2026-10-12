import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useLocale } from '../i18n'

/**
 * Keeps the tray menu in the UI language. Rust can't see the WebView's
 * system language, so the main window resolves the locale and sends it
 * whenever it changes (and once at startup).
 */
export function useTrayLocale() {
  const locale = useLocale()
  useEffect(() => {
    invoke('set_tray_locale', { locale }).catch(() => {})
  }, [locale])
}
