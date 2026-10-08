import { create } from 'zustand'
import type { PetMood } from '../types/pet'

// Runtime pet state shared across hooks. Persisted settings (provider,
// activePetId, size…) live in `configStore`; the loaded PetDefinition and the
// current animation are local to App.tsx / usePetMovement.

interface AppState {
  mood: PetMood
  setMood: (mood: Partial<PetMood>) => void
}

export const useAppStore = create<AppState>((set) => ({
  mood: { energy: 80, happiness: 80, curiosity: 60 },
  setMood: (partial) => set((state) => ({ mood: { ...state.mood, ...partial } })),
}))
