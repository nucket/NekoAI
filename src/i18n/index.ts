// ─── i18n ─────────────────────────────────────────────────────────────────────
// A deliberately small layer: one flat dictionary per locale, `{name}`
// placeholders, and the locale taken from `config.language` (set in Settings)
// or, when that is unset, from the system language. English is the fallback.
//
// React components use `useT()`, which re-renders when the language changes;
// code outside components (error messages, onboarding text) calls `t()`,
// which reads the current config when it runs.

import { useCallback } from 'react'
import { useConfigStore } from '../store/configStore'
import { en } from './en'
import { es } from './es'

export type MessageKey = keyof typeof en
export type Dictionary = Record<MessageKey, string>
export type Locale = 'en' | 'es'
export type Params = Record<string, string | number>

export const LOCALES: readonly Locale[] = ['en', 'es']

/** Each language's name, written in that language (for the Settings picker). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
}

const DICTIONARIES: Record<Locale, Dictionary> = { en, es }

function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale)
}

/** The explicit choice when there is one, else the system language, else English. */
export function resolveLocale(
  preference?: string | null,
  systemLanguage: string | undefined = globalThis.navigator?.language
): Locale {
  if (isLocale(preference)) return preference
  const base = systemLanguage?.toLowerCase().split('-')[0]
  return isLocale(base) ? base : 'en'
}

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const template = DICTIONARIES[locale][key] ?? en[key]
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

export function currentLocale(): Locale {
  return resolveLocale(useConfigStore.getState().config.language)
}

/** Translates with the current language; for code outside React components. */
export function t(key: MessageKey, params?: Params): string {
  return translate(currentLocale(), key, params)
}

/** The current locale, re-rendering when the language setting changes. */
export function useLocale(): Locale {
  const preference = useConfigStore((s) => s.config.language)
  return resolveLocale(preference)
}

/** `t` bound to the current locale, re-rendering when it changes. */
export function useT(): (key: MessageKey, params?: Params) => string {
  const locale = useLocale()
  return useCallback((key, params) => translate(locale, key, params), [locale])
}
