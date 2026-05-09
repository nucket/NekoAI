import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { AIConfig } from '../ai/types'

interface ConfigStore {
  config: AIConfig
  isLoaded: boolean
  loadConfig: () => Promise<void>
  setProvider: (provider: AIConfig['provider']) => Promise<void>
  setApiKey: (apiKey: string) => Promise<void>
  setModel: (model: string) => Promise<void>
  setBaseUrl: (baseUrl: string) => Promise<void>
  setPetSize: (petSize: number) => Promise<void>
  setPetMode: (petMode: AIConfig['petMode']) => Promise<void>
  setActivePetId: (activePetId: string) => Promise<void>
  setOnboardingCompleted: (completed: boolean) => Promise<void>
  setOllamaAutoDetected: (detected: boolean) => Promise<void>
  applyOllamaAutoConfig: (model: string, baseUrl?: string) => Promise<void>
}

export function isConfigured(config: AIConfig): boolean {
  return config.provider === 'ollama' ? true : !!config.apiKey
}

// Mirror of `AIConfig::default()` in src-tauri/src/storage.rs — keep in sync.
// Gemini is the default for free-tier onboarding friction reasons.
const DEFAULT_CONFIG: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  petSize: 32,
  activePetId: 'classic-neko',
}

async function persist(config: AIConfig): Promise<void> {
  await invoke('save_config', { config })
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  isLoaded: false,

  loadConfig: async () => {
    const config = await invoke<AIConfig>('get_config')
    set({ config, isLoaded: true })
  },

  setProvider: async (provider) => {
    const config = { ...get().config, provider }
    set({ config })
    await persist(config)
  },

  setApiKey: async (apiKey) => {
    const config = { ...get().config, apiKey }
    set({ config })
    await persist(config)
  },

  setModel: async (model) => {
    const config = { ...get().config, model }
    set({ config })
    await persist(config)
  },

  setBaseUrl: async (baseUrl) => {
    const config = { ...get().config, baseUrl }
    set({ config })
    await persist(config)
  },

  setPetSize: async (petSize) => {
    const config = { ...get().config, petSize }
    set({ config })
    await persist(config)
  },

  setPetMode: async (petMode) => {
    const config = { ...get().config, petMode }
    set({ config })
    await persist(config)
  },

  setActivePetId: async (activePetId) => {
    const config = { ...get().config, activePetId }
    set({ config })
    await persist(config)
  },

  setOnboardingCompleted: async (onboardingCompleted) => {
    const config = { ...get().config, onboardingCompleted }
    set({ config })
    await persist(config)
  },

  setOllamaAutoDetected: async (ollamaAutoDetected) => {
    const config = { ...get().config, ollamaAutoDetected }
    set({ config })
    await persist(config)
  },

  // Atomic write of provider + model + baseUrl + flags. Used by the onboarding
  // detection so we don't race three separate `save_config` round-trips.
  applyOllamaAutoConfig: async (model, baseUrl = 'http://localhost:11434') => {
    const config: AIConfig = {
      ...get().config,
      provider: 'ollama',
      model,
      baseUrl,
      ollamaAutoDetected: true,
      onboardingCompleted: true,
    }
    set({ config })
    await persist(config)
  },
}))
