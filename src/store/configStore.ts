import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AIConfig } from '../ai/types'

/** Fields to change. `null` clears an optional field on the Rust side. */
export type ConfigPatch = { [K in keyof AIConfig]?: AIConfig[K] | null }

interface ConfigStore {
  config: AIConfig
  isLoaded: boolean
  loadConfig: () => Promise<void>
  /** Merge-and-persist any subset of fields in one write. */
  updateConfig: (patch: ConfigPatch) => Promise<void>
  setProvider: (provider: AIConfig['provider']) => Promise<void>
  setApiKey: (apiKey: string) => Promise<void>
  setModel: (model: string) => Promise<void>
  setBaseUrl: (baseUrl: string) => Promise<void>
  setPetSize: (petSize: number) => Promise<void>
  setPetMode: (petMode: AIConfig['petMode']) => Promise<void>
  setActivePetId: (activePetId: string) => Promise<void>
  setOnboardingCompleted: (completed: boolean) => Promise<void>
  setOllamaAutoDetected: (detected: boolean) => Promise<void>
  setMaxTokens: (maxTokens: number) => Promise<void>
  applyOllamaAutoConfig: (model: string, baseUrl?: string) => Promise<void>
}

export function isConfigured(config: AIConfig): boolean {
  return config.provider === 'ollama' ? true : !!config.hasApiKey
}

// Mirror of `AIConfig::default()` in src-tauri/src/storage.rs — keep in sync.
// Gemini is the default for free-tier onboarding friction reasons.
const DEFAULT_CONFIG: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  petSize: 32,
  activePetId: 'classic-neko',
}

function applyPatch(config: AIConfig, patch: ConfigPatch): AIConfig {
  const next: Record<string, unknown> = { ...config }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key]
    else if (value !== undefined) next[key] = value
  }
  // The key itself is never kept in the store (the backend holds it); only
  // whether there is one.
  if ('apiKey' in patch) {
    next.hasApiKey = !!patch.apiKey
    delete next.apiKey
  }
  return next as AIConfig
}

// Every Tauri window (main, panel, house) is a separate WebView with its own
// copy of this store. Writes therefore send only the changed fields to the
// `patch_config` command, which merges them into config.toml under a lock and
// broadcasts the merged config as `config-updated`; every window adopts that
// payload. (Persisting the whole object let a stale copy in one window
// overwrite another window's edits.)
let subscribed = false

export const useConfigStore = create<ConfigStore>((set, get) => {
  const update = async (patch: ConfigPatch): Promise<void> => {
    // Optimistic, so inputs don't lag; the merged result replaces it.
    set({ config: applyPatch(get().config, patch) })
    const merged = await invoke<AIConfig>('patch_config', { patch })
    set({ config: merged })
  }

  return {
    config: DEFAULT_CONFIG,
    isLoaded: false,

    loadConfig: async () => {
      if (!subscribed) {
        subscribed = true
        listen<AIConfig>('config-updated', (e) => set({ config: e.payload, isLoaded: true })).catch(
          () => {
            subscribed = false
          }
        )
      }
      const config = await invoke<AIConfig>('get_config')
      set({ config, isLoaded: true })
    },

    updateConfig: update,
    setProvider: (provider) => update({ provider }),
    setApiKey: (apiKey) => update({ apiKey }),
    setModel: (model) => update({ model }),
    setBaseUrl: (baseUrl) => update({ baseUrl }),
    setPetSize: (petSize) => update({ petSize }),
    setPetMode: (petMode) => update({ petMode }),
    setActivePetId: (activePetId) => update({ activePetId }),
    setOnboardingCompleted: (onboardingCompleted) => update({ onboardingCompleted }),
    setOllamaAutoDetected: (ollamaAutoDetected) => update({ ollamaAutoDetected }),
    setMaxTokens: (maxTokens) => update({ maxTokens }),

    // Provider + model + baseUrl + flags in a single write. Used by the
    // onboarding detection.
    applyOllamaAutoConfig: (model, baseUrl = 'http://localhost:11434') =>
      update({
        provider: 'ollama',
        model,
        baseUrl,
        ollamaAutoDetected: true,
        onboardingCompleted: true,
      }),
  }
})
