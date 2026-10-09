import { useEffect, useState } from 'react'
import type { PetDefinition } from '../types/pet'
import { useConfigStore } from '../store/configStore'

export const DEFAULT_PET_ID = 'classic-neko'

function imageLoads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth > 0)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

/**
 * Loads `pets/<id>/pet.json` whenever the active pet changes. pets/ is served
 * as static HTTP assets by Vite (dev) and bundled into dist/pets/ by the
 * vite.config build hook (production), so no Tauri fs APIs are needed.
 */
export function usePetDefinition(activePetId: string): {
  petDef: PetDefinition | null
  spritesDir: string
} {
  const [petDef, setPetDef] = useState<PetDefinition | null>(null)
  const [spritesDir, setSpritesDir] = useState('')

  useEffect(() => {
    async function loadPet() {
      try {
        const res = await fetch(`/pets/${activePetId}/pet.json`)
        if (!res.ok) throw new Error(`HTTP ${res.status} – ${res.url}`)

        const def: PetDefinition = await res.json()
        const spritesPath = `/pets/${activePetId}/${def.spritesDir}`

        // A pet whose frames can't load renders as an empty canvas — the pet
        // just vanishes. Probe the first idle frame before committing to it.
        const idleFrame = def.animations?.idle?.files?.[0]
        if (!idleFrame || !(await imageLoads(`${spritesPath}/${idleFrame}`))) {
          throw new Error(`sprites missing for "${activePetId}"`)
        }

        setPetDef(def)
        setSpritesDir(spritesPath)
      } catch (err) {
        console.error('[NekoAI] loadPet failed:', err)
        // Fall back to the default pet (e.g. a stored id that is no longer
        // bundled). The default itself is never retried, so this can't loop.
        if (activePetId !== DEFAULT_PET_ID) {
          void useConfigStore.getState().setActivePetId(DEFAULT_PET_ID)
        }
      }
    }
    loadPet()
  }, [activePetId])

  return { petDef, spritesDir }
}
