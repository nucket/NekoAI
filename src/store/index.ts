import { create } from 'zustand'
import type { PetMood } from '../types/pet'
import type { AIConfig } from '../ai'

// `activePetId` lives in `configStore` (persisted to SQLite) and is the
// single source of truth for which pet is currently active. The fully
// loaded PetDefinition is held in App.tsx local state — there is no
// external consumer that needs it on the store yet.

interface AppState {
  mood: PetMood
  currentAnimation: string
  aiConfig: AIConfig | null
  setMood: (mood: Partial<PetMood>) => void
  setCurrentAnimation: (name: string) => void
  setAIConfig: (config: AIConfig) => void
}

export const useAppStore = create<AppState>((set) => ({
  mood: { energy: 80, happiness: 80, curiosity: 60 },
  currentAnimation: 'idle',
  aiConfig: null,
  setMood: (partial) => set((state) => ({ mood: { ...state.mood, ...partial } })),
  setCurrentAnimation: (name) => set({ currentAnimation: name }),
  setAIConfig: (config) => set({ aiConfig: config }),
}))
