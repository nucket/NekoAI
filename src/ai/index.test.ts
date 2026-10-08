import { describe, expect, it } from 'vitest'
import { buildContextBlock } from './index'
import { MAX_TOKENS_PRESETS } from './types'

describe('buildContextBlock', () => {
  it('starts with the pet persona', () => {
    const prompt = buildContextBlock({ persona: 'You are Pingu, a penguin.' })
    expect(prompt.startsWith('You are Pingu, a penguin.')).toBe(true)
  })

  it('falls back to a generic persona that is not a cat', () => {
    for (const persona of [undefined, '', '   ']) {
      const prompt = buildContextBlock({ persona })
      expect(prompt).toMatch(/^You are a tiny animated pet/)
      expect(prompt).not.toMatch(/\bcat\b/)
    }
  })

  it('includes known facts and mood only when present', () => {
    expect(buildContextBlock()).not.toContain('Known facts')
    expect(buildContextBlock()).not.toContain('current mood')

    const prompt = buildContextBlock({
      facts: { name: 'Naudy', project: 'NekoAI' },
      mood: { energy: 10, happiness: 90, curiosity: 80 },
    })
    expect(prompt).toContain('Known facts about the user: name=Naudy, project=NekoAI.')
    expect(prompt).toContain('Your current mood: sleepy, happy, curious.')
  })

  it('maps the token budget to the Settings length presets', () => {
    expect(buildContextBlock({ maxTokens: MAX_TOKENS_PRESETS.short })).toContain(
      'one short paragraph at most'
    )
    expect(buildContextBlock({ maxTokens: MAX_TOKENS_PRESETS.medium })).toContain(
      'about three short paragraphs'
    )
    expect(buildContextBlock({ maxTokens: MAX_TOKENS_PRESETS.long })).toContain(
      'about six paragraphs'
    )
    // Unset falls back to DEFAULT_MAX_TOKENS (medium).
    expect(buildContextBlock()).toContain('about three short paragraphs')
  })

  it('states length and plain-text rules last, after the persona', () => {
    const prompt = buildContextBlock({ persona: 'Give 1-2 sentence answers.' })
    expect(prompt.indexOf('Reply length')).toBeGreaterThan(prompt.indexOf('1-2 sentence'))
    expect(prompt.trimEnd().endsWith('cannot render markdown.')).toBe(true)
  })
})
