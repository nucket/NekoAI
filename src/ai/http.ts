// Shared transport helpers for the providers that call their APIs straight
// from the WebView (Anthropic, OpenAI, Gemini). NVIDIA and Ollama go through
// Rust, where reqwest already enforces its own timeouts (see lib.rs).

// Upper bound for a single chat request. Matches the Ollama timeout in lib.rs;
// cloud replies normally land in a few seconds, so reaching this means the
// request is stuck — without it the bubble would sit on "thinking" forever.
export const REQUEST_TIMEOUT_MS = 60_000

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`, { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// A 200 OK that carries no usable text — the token budget ran out before any
// output, a safety filter blocked the reply, etc. `describeSendError` in
// App.tsx keys off the "empty response" phrase, so keep it in the message.
export function emptyReplyError(provider: string, reason?: string | null): Error {
  return new Error(`${provider} returned an empty response${reason ? ` (${reason})` : ''}`)
}
