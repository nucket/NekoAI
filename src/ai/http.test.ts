import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyReplyError, fetchWithTimeout } from './http'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchWithTimeout', () => {
  it('turns an abort after the timeout into a "timed out" error', async () => {
    // A fetch that never resolves on its own, only rejects when aborted.
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      })
    })
    await expect(fetchWithTimeout('https://example.test', {}, 20)).rejects.toThrow(/timed out/)
  })

  it('passes network errors through unchanged', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(fetchWithTimeout('https://example.test', {}, 1000)).rejects.toThrow(
      'Failed to fetch'
    )
  })

  it('returns the response when fetch resolves in time', async () => {
    vi.stubGlobal('fetch', async () => new Response('ok', { status: 200 }))
    const res = await fetchWithTimeout('https://example.test', {}, 1000)
    expect(await res.text()).toBe('ok')
  })
})

describe('emptyReplyError', () => {
  it('names the provider and the reason', () => {
    expect(emptyReplyError('Gemini', 'MAX_TOKENS').message).toBe(
      'Gemini returned an empty response (MAX_TOKENS)'
    )
    expect(emptyReplyError('OpenAI', null).message).toBe('OpenAI returned an empty response')
  })
})
