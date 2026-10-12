// ─── Error messaging ───────────────────────────────────────────────────────────
// Provider calls run in Rust (src-tauri/src/ai.rs), which rejects with a
// structured `{ kind, message }`. `toAiError` wraps that in an Error the UI can
// show (Settings → Test prints `.message`), and `describeSendError` turns the
// kind into a short, actionable message in the pet's voice.

import { t } from '../i18n'

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
      return t('error.timeout')
    case 'empty':
      return t('error.empty')
    case 'network':
      return t(provider === 'ollama' ? 'error.networkOllama' : 'error.network')
    case 'auth':
      return t('error.auth')
    case 'rate_limit':
      return t('error.rateLimit')
    case 'invalid_request':
      return t('error.invalidRequest')
    default:
      return t('error.generic')
  }
}
