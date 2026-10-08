import { describe, expect, it } from 'vitest'
import { describeSendError } from './errors'

describe('describeSendError', () => {
  it('reports timeouts as slow, even when reqwest also says "request failed"', () => {
    const reqwest = new Error('Ollama request failed: error sending request: operation timed out')
    expect(describeSendError(reqwest, 'ollama')).toMatch(/taking too long/)
    expect(describeSendError(new Error('Request timed out after 60s'), 'gemini')).toMatch(
      /taking too long/
    )
  })

  it('reports empty replies', () => {
    const err = new Error('Gemini returned an empty response (MAX_TOKENS)')
    expect(describeSendError(err, 'gemini')).toMatch(/couldn't come up with an answer/)
  })

  it('distinguishes an unreachable Ollama daemon from no internet', () => {
    expect(describeSendError(new TypeError('Failed to fetch'), 'ollama')).toMatch(/reach Ollama/)
    expect(describeSendError(new TypeError('Failed to fetch'), 'openai')).toMatch(
      /reach the internet/
    )
  })

  it('reports invalid credentials, including Gemini 400', () => {
    expect(describeSendError(new Error('Anthropic API error: 401 '), 'anthropic')).toMatch(
      /API key looks invalid/
    )
    expect(describeSendError(new Error('Gemini API error: 400 '), 'gemini')).toMatch(
      /API key looks invalid/
    )
    // A 400 from another provider is not a key problem.
    expect(describeSendError(new Error('OpenAI API error: 400 '), 'openai')).toMatch(
      /something went wrong/
    )
  })

  it('reports rate limits', () => {
    expect(describeSendError(new Error('Gemini API error: 429 '), 'gemini')).toMatch(/usage limit/)
  })

  it('falls back to a generic message for anything else', () => {
    expect(describeSendError('weird', 'openai')).toBe('Sorry, something went wrong. 😿')
  })
})
