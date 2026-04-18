import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { AIConfig } from '../ai/types';

interface ConfigStore {
  config: AIConfig;
  isLoaded: boolean;
  loadConfig: () => Promise<void>;
  setProvider: (provider: AIConfig['provider']) => Promise<void>;
  setApiKey: (apiKey: string) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  setBaseUrl: (baseUrl: string) => Promise<void>;
  setPetSize: (petSize: number) => Promise<void>;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
};

async function persist(config: AIConfig): Promise<void> {
  await invoke('save_config', { config });
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  isLoaded: false,

  loadConfig: async () => {
    const config = await invoke<AIConfig>('get_config');
    set({ config, isLoaded: true });
  },

  setProvider: async (provider) => {
    const config = { ...get().config, provider };
    set({ config });
    await persist(config);
  },

  setApiKey: async (apiKey) => {
    const config = { ...get().config, apiKey };
    set({ config });
    await persist(config);
  },

  setModel: async (model) => {
    const config = { ...get().config, model };
    set({ config });
    await persist(config);
  },

  setBaseUrl: async (baseUrl) => {
    const config = { ...get().config, baseUrl };
    set({ config });
    await persist(config);
  },

  setPetSize: async (petSize) => {
    const config = { ...get().config, petSize };
    set({ config });
    await persist(config);
  },
}));
