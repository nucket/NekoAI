import { create } from 'zustand'
import type { PetDefinition, PetMood } from '../types/pet'
import type { AIConfig } from '../ai'

interface AppState {
  activePet: PetDefinition | null
  mood: PetMood
  currentAnimation: string
  aiConfig: AIConfig | null
  setActivePet: (pet: PetDefinition) => void
  setMood: (mood: Partial<PetMood>) => void
  setCurrentAnimation: (name: string) => void
  setAIConfig: (config: AIConfig) => void
}

export const useAppStore = create<AppState>((set) => ({
  activePet: null,
  mood: { energy: 80, happiness: 80, curiosity: 60 },
  currentAnimation: 'idle',
  aiConfig: null,
  setActivePet: (pet) => set({ activePet: pet }),
  setMood: (partial) => set((state) => ({ mood: { ...state.mood, ...partial } })),
  setCurrentAnimation: (name) => set({ currentAnimation: name }),
  setAIConfig: (config) => set({ aiConfig: config }),
}))
