// ─── Error messaging ───────────────────────────────────────────────────────────
// Turns a raw provider/transport error into a short, actionable message in the
// pet's voice. The failure shapes recognised:
//   • Timeouts — "Request timed out …" (src/ai/http.ts) or reqwest's
//     "… operation timed out" (Ollama / NVIDIA).
//   • Empty replies — "<Provider> returned an empty response (<reason>)": the
//     request succeeded but carried no text (token budget, safety block).
//   • fetch() network failures — "Failed to fetch" / "Load failed" (Anthropic,
//     OpenAI, Gemini run in the WebView).
//   • Rust-proxied connection failures — "<Provider> request failed: …" (the
//     Ollama / NVIDIA paths go through reqwest).
//   • HTTP-status errors — "<Provider> API error: <code> …" (all providers).
// Anything unrecognised falls back to the generic message.

export function describeSendError(err: unknown, provider: string): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()

  // Checked before the connection case: reqwest timeouts also contain
  // "request failed", but "slow" is more accurate than "unreachable".
  if (msg.includes('timed out')) {
    return "I'm taking too long to think — try again in a moment. ⏳"
  }

  if (msg.includes('empty response')) {
    return "I couldn't come up with an answer — try rephrasing, or pick a longer response length in Settings. 💭"
  }

  // Connection / unreachable — no network or daemon down.
  if (
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('network error') ||
    msg.includes('networkerror') ||
    msg.includes('request failed')
  ) {
    return provider === 'ollama'
      ? "I can't reach Ollama — make sure it's running. 🐾"
      : "I can't reach the internet right now — check your connection. 🐾"
  }

  // Invalid credentials — 401 / 403, or a Gemini 400 (its invalid-key status).
  if (
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    (provider === 'gemini' && msg.includes('400'))
  ) {
    return 'My API key looks invalid — open Settings to fix it. 🔑'
  }

  // Rate limit / quota exhausted — 429 or a provider quota message.
  if (
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted')
  ) {
    return "I've hit the usage limit for now — try again in a little while. 😿"
  }

  return 'Sorry, something went wrong. 😿'
}
