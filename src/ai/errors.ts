// ─── Error messaging ───────────────────────────────────────────────────────────
// Provider calls run in Rust (src-tauri/src/ai.rs), which rejects with a
// structured `{ kind, message }`. `toAiError` wraps that in an Error the UI can
// show (Settings → Test prints `.message`), and `describeSendError` turns the
// kind into a short, actionable message in the pet's voice.

export type AiErrorKind =
  'auth' | 'rate_limit' | 'network' | 'timeout' | 'empty' | 'invalid_request' | 'other'

const KINDS: readonly AiErrorKind[] = [
  'auth',
  'rate_limit',
  'network',
  'timeout',
  'empty',
  'invalid_request',
  'other',
]

export class AiRequestError extends Error {
  readonly kind: AiErrorKind

  constructor(kind: AiErrorKind, message: string) {
    super(message)
    this.name = 'AiRequestError'
    this.kind = kind
  }
}

/** Normalises whatever `invoke('ai_chat')` rejected with. */
export function toAiError(err: unknown): AiRequestError {
  if (err instanceof AiRequestError) return err
  if (err && typeof err === 'object' && 'kind' in err && 'message' in err) {
    const { kind, message } = err as { kind: unknown; message: unknown }
    const known = KINDS.includes(kind as AiErrorKind) ? (kind as AiErrorKind) : 'other'
    return new AiRequestError(known, String(message))
  }
  return new AiRequestError('other', err instanceof Error ? err.message : String(err))
}

export function describeSendError(err: unknown, provider: string): string {
  switch (toAiError(err).kind) {
    case 'timeout':
      return "I'm taking too long to think — try again in a moment. ⏳"
    case 'empty':
      return "I couldn't come up with an answer — try rephrasing, or pick a longer response length in Settings. 💭"
    case 'network':
      return provider === 'ollama'
        ? "I can't reach Ollama — make sure it's running. 🐾"
        : "I can't reach the internet right now — check your connection. 🐾"
    case 'auth':
      return 'My API key looks invalid — open Settings to fix it. 🔑'
    case 'rate_limit':
      return "I've hit the usage limit for now — try again in a little while. 😿"
    case 'invalid_request':
      return 'Something in my AI settings looks off (URL or model name) — open Settings to check. ⚙'
    default:
      return 'Sorry, something went wrong. 😿'
  }
}
