import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import './SpeechBubble.css'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface SpeechBubbleProps {
  /** Controlled by parent (parent also handles window resize). */
  isOpen: boolean
  /** Whether the bubble appears above or below the sprite. */
  position: 'above' | 'below'
  /** Called when the user closes the bubble or the inactivity timer fires. */
  onClose: () => void
  /** Async function that takes the user's message and returns the AI reply. */
  onSendMessage: (message: string) => Promise<string>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INACTIVITY_MS = 30_000
const SCRAMBLE_FRAME_MS = 30
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%!?<>[]{}'
const SCRAMBLE_LOOKAHEAD = 5 // scrambled chars visible ahead of the locked position

// ─── Component ───────────────────────────────────────────────────────────────

export function SpeechBubble({ isOpen, position, onClose, onSendMessage }: SpeechBubbleProps) {
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
  const resetTimer = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current)
    inactivityRef.current = setTimeout(onClose, INACTIVITY_MS)
  }, [onClose])

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

    // Focus input as soon as the bubble is mounted (next paint)
    requestAnimationFrame(() => inputRef.current?.focus())
    resetTimer()
  }, [isOpen, resetTimer])

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
    let frame = 0
    const total = pendingText.length
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTypedSoFar('')

    const rndChar = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]

    typewriterRef.current = setInterval(() => {
      frame++
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

  return (
    <div
      className={`speech-bubble speech-bubble--${position}`}
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

      {/* ── Input row ───────────────────────────────────────────────────── */}
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

      {/* ── Triangle tail (points toward sprite) ────────────────────────── */}
      <div className={`speech-bubble__tail speech-bubble__tail--${position}`} aria-hidden="true" />
    </div>
  )
}
