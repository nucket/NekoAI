import { describe, expect, it } from 'vitest'
import { MAX_TOKENS_PRESETS, maxTokensPreset } from './types'

describe('maxTokensPreset', () => {
  it('maps preset values back to their key', () => {
    expect(maxTokensPreset(MAX_TOKENS_PRESETS.short)).toBe('short')
    expect(maxTokensPreset(MAX_TOKENS_PRESETS.medium)).toBe('medium')
    expect(maxTokensPreset(MAX_TOKENS_PRESETS.long)).toBe('long')
  })

  it('treats a missing value (legacy config) as medium', () => {
    expect(maxTokensPreset(undefined)).toBe('medium')
  })

  it('reports any other number as custom', () => {
    expect(maxTokensPreset(300)).toBe('custom')
    expect(maxTokensPreset(4096)).toBe('custom')
  })
})
