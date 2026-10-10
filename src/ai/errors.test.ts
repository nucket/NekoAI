import { describe, expect, it } from 'vitest'
import { AiRequestError, describeSendError, toAiError } from './errors'

const rustError = (kind: string, message = 'details') => ({ kind, message })

describe('toAiError', () => {
  it('wraps the structured error the Rust command rejects with', () => {
    const err = toAiError(rustError('auth', 'Gemini API error: 400'))
    expect(err).toBeInstanceOf(AiRequestError)
    expect(err).toBeInstanceOf(Error)
    expect(err.kind).toBe('auth')
    expect(err.message).toBe('Gemini API error: 400')
  })

  it('treats unknown kinds and plain errors as "other"', () => {
    expect(toAiError(rustError('brand_new')).kind).toBe('other')
    expect(toAiError(new Error('boom'))).toMatchObject({ kind: 'other', message: 'boom' })
    expect(toAiError('weird').message).toBe('weird')
  })
})

describe('describeSendError', () => {
  it('maps each kind to a message in the pet voice', () => {
    expect(describeSendError(rustError('timeout'), 'gemini')).toMatch(/taking too long/)
    expect(describeSendError(rustError('empty'), 'gemini')).toMatch(/couldn't come up/)
    expect(describeSendError(rustError('auth'), 'anthropic')).toMatch(/API key looks invalid/)
    expect(describeSendError(rustError('rate_limit'), 'openai')).toMatch(/usage limit/)
    expect(describeSendError(rustError('invalid_request'), 'ollama')).toMatch(/URL or model/)
  })

  it('distinguishes an unreachable Ollama daemon from no internet', () => {
    expect(describeSendError(rustError('network'), 'ollama')).toMatch(/reach Ollama/)
    expect(describeSendError(rustError('network'), 'openai')).toMatch(/reach the internet/)
  })

  it('falls back to a generic message for anything else', () => {
    expect(describeSendError(rustError('other'), 'openai')).toBe('Sorry, something went wrong. 😿')
    expect(describeSendError('weird', 'openai')).toBe('Sorry, something went wrong. 😿')
  })
})
