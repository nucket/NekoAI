import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
  type CSSProperties,
} from 'react'
import './SpeechBubble.css'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface AnnouncementAction {
  label: string
  onClick: () => void
  primary?: boolean
}

export interface AnnouncementContent {
  text: string
  actions: AnnouncementAction[]
}

export interface SpeechBubbleProps {
  /** Controlled by parent (parent also handles window resize). */
  isOpen: boolean
  /** Whether the bubble appears above or below the sprite. */
  position: 'above' | 'below'
  /** Live pet sprite size in px. The bubble is anchored just off the sprite
   *  edge so the tail stays connected at every configured pet size. */
  spriteSize: number
  /** Called when the user closes the bubble or the inactivity timer fires. */
  onClose: () => void
  /** Async function that takes the user's message and returns the AI reply.
   *  Ignored when `announcement` is provided. */
  onSendMessage: (message: string) => Promise<string>
  /** Loads the most recent conversation turns so a reopened bubble shows
   *  prior context instead of starting blank. Skipped in announcement mode. */
  loadHistory?: () => Promise<Message[]>
  /** When set, the bubble shows a single message + action buttons instead of
   *  the chat input. Used for onboarding / system prompts. The inactivity
   *  timer is also disabled in this mode (CTAs require user attention). */
  announcement?: AnnouncementContent
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INACTIVITY_MS = 30_000
const SCRAMBLE_FRAME_MS = 30
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%!?<>[]{}'
const SCRAMBLE_LOOKAHEAD = 5 // scrambled chars visible ahead of the locked position
// Upper bound on how long the scramble reveal may take. Without it a long
// reply (256 tokens ≈ 1000+ chars) would crawl for ~30s at SCRAMBLE_FRAME_MS
// per character. Short replies still reveal at the natural per-char pace.
const REVEAL_BUDGET_MS = 2400

// ─── Component ───────────────────────────────────────────────────────────────

export function SpeechBubble({
  isOpen,
  position,
  spriteSize,
  onClose,
  onSendMessage,
  loadHistory,
  announcement,
}: SpeechBubbleProps) {
  // ── Internal state (as requested) ─────────────────────────────────────────
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Typewriter: the text currently being revealed letter-by-letter.
  // null = no active typewriter; non-null = still typing.
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [typedSoFar, setTypedSoFar] = useState('')

  // ── Refs ───────────────────────────────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Reset inactivity timer ─────────────────────────────────────────────────
  // In announcement mode the bubble must wait for user action — never auto-close.
  const resetTimer = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current)
    if (announcement) return
    inactivityRef.current = setTimeout(onClose, INACTIVITY_MS)
  }, [onClose, announcement])

  // ── Lifecycle: open / close ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      // Clean up on close
      if (inactivityRef.current) clearTimeout(inactivityRef.current)
      if (typewriterRef.current) clearInterval(typewriterRef.current)
      // Reset conversation state so next open starts fresh
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInputValue('')
      setMessages([])
      setIsLoading(false)
      setPendingText(null)
      setTypedSoFar('')
      return
    }

    // Focus input as soon as the bubble is mounted (next paint).
    // Skipped in announcement mode (no input present).
    if (!announcement) requestAnimationFrame(() => inputRef.current?.focus())
    resetTimer()

    // Preload prior conversation so a reopened bubble isn't blank. Skipped in
    // announcement mode (onboarding shows a single scripted message).
    if (!announcement && loadHistory) {
      void (async () => {
        const history = await loadHistory()
        // Guard: a fast send could land before this resolves — don't clobber.
        setMessages((prev) => (prev.length === 0 ? history : prev))
      })()
    }
  }, [isOpen, resetTimer, announcement, loadHistory])

  // ── Announcement: kick the typewriter on open ─────────────────────────────
  // Re-uses the same scramble effect as AI replies for visual coherence.
  useEffect(() => {
    if (!isOpen || !announcement) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingText(announcement.text)
  }, [isOpen, announcement])

  // ── Auto-scroll to latest message ─────────────────────────────────────────
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typedSoFar, isLoading])

  // ── Scramble text reveal effect ────────────────────────────────────────────
  // Characters lock in left-to-right at SCRAMBLE_FRAME_MS per char.
  // A lookahead window of random noise stays visible just ahead of the locked
  // position, giving the "decoding" feel. Spaces/newlines pass through as-is.
  useEffect(() => {
    if (pendingText === null) return

    if (typewriterRef.current) clearInterval(typewriterRef.current)
    const total = pendingText.length
    // Reveal `step` characters per frame so long replies finish within
    // REVEAL_BUDGET_MS instead of locking one char at a time. Short replies
    // resolve to step = 1, keeping the original SCRAMBLE_FRAME_MS/char feel.
    const maxFrames = Math.max(1, Math.round(REVEAL_BUDGET_MS / SCRAMBLE_FRAME_MS))
    const step = Math.max(1, Math.ceil(total / maxFrames))
    let frame = 0
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTypedSoFar('')

    const rndChar = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]

    typewriterRef.current = setInterval(() => {
      frame += step
      if (frame >= total) {
        clearInterval(typewriterRef.current!)
        setMessages((prev) => [...prev, { role: 'assistant', content: pendingText }])
        setPendingText(null)
        setTypedSoFar('')
        return
      }

      // Locked prefix + scrambled lookahead window
      let display = pendingText.slice(0, frame)
      for (let i = frame; i < Math.min(frame + SCRAMBLE_LOOKAHEAD, total); i++) {
        const ch = pendingText[i]
        display += ch === ' ' || ch === '\n' ? ch : rndChar()
      }
      setTypedSoFar(display)
    }, SCRAMBLE_FRAME_MS)

    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current)
    }
  }, [pendingText])

  // ── Pause auto-close while the pet is busy ─────────────────────────────────
  // The inactivity timer must only count once a full reply is on screen. While
  // a request is in flight (isLoading) or the typewriter is still revealing
  // (pendingText), the timer is cleared — so a slow model or a long reply can
  // never close the bubble mid-thought. Announcement mode never auto-closes.
  useEffect(() => {
    if (!isOpen || announcement) return
    if (isLoading || pendingText !== null) {
      if (inactivityRef.current) clearTimeout(inactivityRef.current)
    } else {
      resetTimer()
    }
  }, [isOpen, announcement, isLoading, pendingText, resetTimer])

  // ── Send handler ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputValue.trim()
    if (!text || isLoading || pendingText !== null) return

    setInputValue('')
    resetTimer()

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setIsLoading(true)

    try {
      const reply = await onSendMessage(text)
      setIsLoading(false)
      setPendingText(reply) // kicks off the typewriter via useEffect
    } catch (err) {
      console.error('[SpeechBubble] onSendMessage error:', err)
      setIsLoading(false)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. 😿' },
      ])
    }
  }, [inputValue, isLoading, pendingText, onSendMessage, resetTimer])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      resetTimer() // any key press resets inactivity
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, resetTimer, onClose]
  )

  // ── Render guard ───────────────────────────────────────────────────────────
  if (!isOpen) return null

  const isTyping = pendingText !== null
  const hasMessages = messages.length > 0 || isTyping || isLoading

  // Anchor the bubble just off the sprite edge: `bottom` when it sits above the
  // sprite (tail points down), `top` when below. Offset = sprite size + tail
  // height (11px) + a small visual gap, so the tail meets the sprite at any
  // configured pet size instead of floating at a fixed window offset.
  const anchorOffset = spriteSize + 11 + 3
  const anchorStyle: CSSProperties =
    position === 'above' ? { bottom: anchorOffset } : { top: anchorOffset }

  return (
    <div
      className={`speech-bubble speech-bubble--${position}`}
      style={anchorStyle}
      role="dialog"
      aria-label="NekoAI chat"
      // Prevent drag from starting while interacting with the bubble
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Close button ────────────────────────────────────────────────── */}
      <button
        className="speech-bubble__close"
        onClick={onClose}
        aria-label="Close chat"
        tabIndex={-1}
      >
        ×
      </button>

      {/* ── Message history ─────────────────────────────────────────────── */}
      {hasMessages && (
        <div className="speech-bubble__messages">
          {/* Committed messages */}
          {messages.map((msg, i) => (
            <div key={i} className={`speech-bubble__msg speech-bubble__msg--${msg.role}`}>
              {msg.content}
            </div>
          ))}

          {/* Live typewriter line (assistant response being revealed) */}
          {isTyping && (
            <div className="speech-bubble__msg speech-bubble__msg--assistant">
              {typedSoFar}
              <span className="speech-bubble__cursor" aria-hidden="true" />
            </div>
          )}

          {/* Thinking indicator while waiting for the network response */}
          {isLoading && (
            <div className="speech-bubble__msg speech-bubble__msg--assistant">
              <span className="speech-bubble__thinking" aria-label="Thinking">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}

          <div ref={msgsEndRef} />
        </div>
      )}

      {/* ── Action buttons (announcement mode) ──────────────────────────── */}
      {announcement && !isTyping && (
        <div className="speech-bubble__cta-row">
          {announcement.actions.map((action, i) => (
            <button
              key={i}
              className={
                action.primary
                  ? 'speech-bubble__cta speech-bubble__cta--primary'
                  : 'speech-bubble__cta'
              }
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Input row (chat mode only) ──────────────────────────────────── */}
      {!announcement && (
        <div className="speech-bubble__input-row">
          <input
            ref={inputRef}
            type="text"
            className="speech-bubble__input"
            placeholder="Say something…"
            value={inputValue}
            autoComplete="off"
            spellCheck={false}
            disabled={isLoading || isTyping}
            onChange={(e) => {
              setInputValue(e.target.value)
              resetTimer()
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            className="speech-bubble__send"
            onClick={handleSend}
            disabled={isLoading || isTyping || !inputValue.trim()}
            aria-label="Send message"
          >
            ↵
          </button>
        </div>
      )}

      {/* ── Triangle tail (points toward sprite) ────────────────────────── */}
      <div className={`speech-bubble__tail speech-bubble__tail--${position}`} aria-hidden="true" />
    </div>
  )
}
