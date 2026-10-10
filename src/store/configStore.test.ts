import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '../ai/types'

// In-memory stand-in for the Rust side: `patch_config` merges like
// storage::merge_config (null clears a field) and broadcasts the result. Like
// PublicConfig, what reaches the WebView never carries the key itself.
function publicView(stored: Record<string, unknown>) {
  const { apiKey, ...rest } = stored
  return { ...rest, hasApiKey: !!apiKey }
}
const backend = vi.hoisted(() => {
  const state = {
    stored: {} as Record<string, unknown>,
    patches: [] as Record<string, unknown>[],
    listener: null as null | ((e: { payload: unknown }) => void),
  }
  return state
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: { patch?: Record<string, unknown> }) => {
    if (cmd === 'get_config') return publicView(backend.stored)
    if (cmd === 'patch_config' && args?.patch) {
      backend.patches.push(args.patch)
      const next = { ...backend.stored }
      for (const [key, value] of Object.entries(args.patch)) {
        if (value === null) delete next[key]
        else next[key] = value
      }
      backend.stored = next
      backend.listener?.({ payload: publicView(next) })
      return publicView(next)
    }
    throw new Error(`unexpected command ${cmd}`)
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, handler: (e: { payload: unknown }) => void) => {
    backend.listener = handler
    return () => {}
  }),
}))

const { useConfigStore, isConfigured } = await import('./configStore')

beforeEach(async () => {
  backend.stored = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    apiKey: 'AIza-old',
    petSize: 64,
  }
  backend.patches = []
  await useConfigStore.getState().loadConfig()
})

describe('configStore', () => {
  it('sends only the changed field, never the whole config', async () => {
    await useConfigStore.getState().setPetSize(128)
    expect(backend.patches).toEqual([{ petSize: 128 }])
    expect(useConfigStore.getState().config).toMatchObject({ petSize: 128, hasApiKey: true })
  })

  it('never keeps the API key in the WebView, only whether one is stored', async () => {
    expect(useConfigStore.getState().config).not.toHaveProperty('apiKey')
    await useConfigStore.getState().setApiKey('AIza-new')
    expect(backend.stored.apiKey).toBe('AIza-new')
    expect(useConfigStore.getState().config).not.toHaveProperty('apiKey')
    expect(useConfigStore.getState().config.hasApiKey).toBe(true)
  })

  it('writes provider + model in a single patch', async () => {
    await useConfigStore.getState().updateConfig({ provider: 'anthropic', model: 'claude-x' })
    expect(backend.patches).toEqual([{ provider: 'anthropic', model: 'claude-x' }])
  })

  it('clears a field with null', async () => {
    await useConfigStore.getState().updateConfig({ apiKey: null })
    expect(backend.stored).not.toHaveProperty('apiKey')
    expect(useConfigStore.getState().config.hasApiKey).toBe(false)
  })

  it('adopts a config broadcast by another window', async () => {
    backend.listener?.({ payload: { ...publicView(backend.stored), petMode: 'wanderer' } })
    expect(useConfigStore.getState().config.petMode).toBe('wanderer')
  })

  it('applies onboarding auto-config atomically', async () => {
    await useConfigStore.getState().applyOllamaAutoConfig('llama3')
    expect(backend.patches).toEqual([
      {
        provider: 'ollama',
        model: 'llama3',
        baseUrl: 'http://localhost:11434',
        ollamaAutoDetected: true,
        onboardingCompleted: true,
      },
    ])
  })
})

describe('isConfigured', () => {
  it('treats Ollama as always configured and others as needing a key', () => {
    const cfg = (c: Partial<AIConfig>) => ({ provider: 'gemini', model: 'm', ...c }) as AIConfig
    expect(isConfigured(cfg({ provider: 'ollama' }))).toBe(true)
    expect(isConfigured(cfg({ hasApiKey: true }))).toBe(true)
    expect(isConfigured(cfg({}))).toBe(false)
  })
})
