import { afterEach, describe, expect, it } from 'vitest'
import { useConfigStore } from '../store/configStore'
import { describeSendError } from '../ai/errors'
import { en } from './en'
import { es } from './es'
import { resolveLocale, t, translate, type MessageKey } from '.'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('resolveLocale', () => {
  it('prefers the explicit setting', () => {
    expect(resolveLocale('es', 'en-US')).toBe('es')
    expect(resolveLocale('en', 'es-ES')).toBe('en')
  })

  it('follows the system language when unset, falling back to English', () => {
    expect(resolveLocale(undefined, 'es-419')).toBe('es')
    expect(resolveLocale(null, 'ES')).toBe('es')
    expect(resolveLocale(undefined, 'fr-FR')).toBe('en')
    expect(resolveLocale(undefined, undefined)).toBe('en')
    expect(resolveLocale('klingon', 'de')).toBe('en')
  })
})

describe('dictionaries', () => {
  it('Spanish translates every key with the same placeholders', () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(es[key], key).toBeTruthy()
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]))
    }
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })
})

describe('translate', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('en', 'about.tagline', { version: '1.2.3' })).toBe(
      'Desktop AI Companion • v1.2.3'
    )
    expect(translate('es', 'settings.length.custom', { tokens: 700 })).toBe(
      'Personalizado · 700 tokens'
    )
    expect(translate('en', 'settings.length.custom')).toBe('Custom · {tokens} tokens')
  })
})

describe('t (outside React)', () => {
  afterEach(() => {
    useConfigStore.setState((s) => ({ config: { ...s.config, language: undefined } }))
  })

  it('uses the language chosen in Settings', () => {
    useConfigStore.setState((s) => ({ config: { ...s.config, language: 'es' } }))
    expect(t('chat.placeholder')).toBe('Di algo…')
    expect(describeSendError({ kind: 'auth', message: '' }, 'openai')).toMatch(/no parece válida/)

    useConfigStore.setState((s) => ({ config: { ...s.config, language: 'en' } }))
    expect(t('chat.placeholder')).toBe('Say something…')
  })
})
