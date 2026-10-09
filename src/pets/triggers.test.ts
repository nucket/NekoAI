import { describe, expect, it } from 'vitest'
import {
  FLASH_MAX_MS,
  FLASH_MIN_MS,
  flashDurationMs,
  idleTriggerFor,
  triggerAnimation,
} from './triggers'

const pet = {
  animations: {
    idle: { files: ['idle.png'], fps: 1, loop: true },
    happy: { files: ['h1.png', 'h2.png'], fps: 4, loop: false },
  },
  triggers: { on_ai_response: 'happy', on_chat_open: 'awaken' },
}

describe('triggerAnimation', () => {
  it('returns the mapped animation when the pet defines it', () => {
    expect(triggerAnimation(pet, 'on_ai_response')).toBe('happy')
  })

  it('ignores triggers that are unmapped or point at a missing animation', () => {
    expect(triggerAnimation(pet, 'on_ai_thinking')).toBeNull()
    expect(triggerAnimation(pet, 'on_chat_open')).toBeNull()
    expect(triggerAnimation(null, 'on_ai_response')).toBeNull()
  })
})

describe('flashDurationMs', () => {
  it('plays one full pass of the animation', () => {
    expect(flashDurationMs(pet.animations.happy)).toBe(500)
  })

  it('clamps very short and very long animations', () => {
    expect(flashDurationMs({ files: ['a.png'], fps: 12, loop: false })).toBe(FLASH_MIN_MS)
    expect(flashDurationMs({ files: ['a.png', 'b.png', 'c.png'], fps: 1, loop: false })).toBe(
      FLASH_MAX_MS
    )
  })

  it('falls back to the minimum for missing or degenerate configs', () => {
    expect(flashDurationMs(undefined)).toBe(FLASH_MIN_MS)
    expect(flashDurationMs({ files: [], fps: 8, loop: false })).toBe(FLASH_MIN_MS)
    expect(flashDurationMs({ files: ['a.png'], fps: 0, loop: false })).toBe(FLASH_MIN_MS)
  })
})

describe('idleTriggerFor', () => {
  it('maps OS idle minutes to the highest threshold reached', () => {
    expect(idleTriggerFor(0)).toBeNull()
    expect(idleTriggerFor(2.99)).toBeNull()
    expect(idleTriggerFor(3)).toBe('on_idle_3min')
    expect(idleTriggerFor(4.5)).toBe('on_idle_3min')
    expect(idleTriggerFor(5)).toBe('on_idle_5min')
    expect(idleTriggerFor(6)).toBe('on_idle_6min')
    expect(idleTriggerFor(120)).toBe('on_idle_6min')
  })
})
