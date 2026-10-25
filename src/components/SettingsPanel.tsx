import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '../store/configStore'
import { usePanelWindow } from '../hooks/usePanelWindow'
import { SETTINGS_H, SETTINGS_W } from '../constants/layout'
import { createAIProvider, buildContextBlock } from '../ai'
import { LOCALES, LOCALE_NAMES, useT, type MessageKey } from '../i18n'
import {
  DEFAULT_MAX_TOKENS,
  MAX_TOKENS_BOUNDS,
  MAX_TOKENS_PRESETS,
  maxTokensPreset,
  type AIConfig,
  type MaxTokensPreset,
} from '../ai/types'

// Worded labels (not S / M / L) so these aren't mistaken for the pet size
// chips in the context menu. Custom has an icon instead (`label` unset).
const RESPONSE_LENGTH_OPTIONS: {
  key: MaxTokensPreset
  label?: MessageKey
  hint: MessageKey
}[] = [
  { key: 'short', label: 'settings.length.shortLabel', hint: 'settings.length.short' },
  { key: 'medium', label: 'settings.length.mediumLabel', hint: 'settings.length.medium' },
  { key: 'long', label: 'settings.length.longLabel', hint: 'settings.length.long' },
  { key: 'custom', hint: 'settings.length.custom' },
]

const CUSTOM_RANGE = `${MAX_TOKENS_BOUNDS.min}–${MAX_TOKENS_BOUNDS.max}`

// ─── Provider defaults ────────────────────────────────────────────────────────

// Gemini is listed first because aistudio.google.com offers a free API tier
// with no credit card — the lowest-friction onboarding path for new users.
// `placeholder` shows the key's shape; Ollama takes no key.
const PROVIDER_DEFAULTS: Record<string, { model: string; placeholder: string }> = {
  gemini: { model: 'gemini-2.5-flash', placeholder: 'AIza…' },
  anthropic: { model: 'claude-haiku-4-5-20251001', placeholder: 'sk-ant-…' },
  openai: { model: 'gpt-4o-mini', placeholder: 'sk-…' },
  ollama: { model: 'llama3', placeholder: '' },
  nvidia: { model: 'meta/llama-3.1-8b-instruct', placeholder: 'nvapi-…' },
}

// External help links — surfaced when the panel opens without working
// credentials. Gemini gets a "free" tag because aistudio offers a free tier
// that's the lowest-friction onboarding path for non-technical users.
const PROVIDER_HELP: Record<string, { url: string; label: MessageKey }> = {
  anthropic: { url: 'https://console.anthropic.com/settings/keys', label: 'settings.help.getKey' },
  openai: { url: 'https://platform.openai.com/api-keys', label: 'settings.help.getKey' },
  gemini: { url: 'https://aistudio.google.com/apikey', label: 'settings.help.getFreeKey' },
  nvidia: { url: 'https://build.nvidia.com/', label: 'settings.help.getKey' },
  ollama: { url: 'https://ollama.com/download', label: 'settings.help.downloadOllama' },
}

// ─── Draft fields ─────────────────────────────────────────────────────────────

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

type DraftField = 'apiKey' | 'model' | 'baseUrl'

// What a draft input shows for the stored config value. The API key is never
// sent to the WebView, so its input starts empty and only ever holds a new key.
function storedDraftValue(config: AIConfig, field: DraftField): string {
  if (field === 'model') return config.model
  if (field === 'apiKey') return ''
  return config.baseUrl ?? DEFAULT_OLLAMA_URL
}

function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur()
}

// ─── Memory section ───────────────────────────────────────────────────────────

const CONFIRM_MS = 3000

// Facts that hold the user's name: `name` from chat extraction and the legacy
// `userName` written by older Settings versions. Forgetting either clears the
// name field below.
const NAME_FACT_KEYS = ['name', 'userName']

const FACT_LABELS: Record<string, MessageKey> = {
  name: 'settings.fact.name',
  userName: 'settings.fact.name',
  project: 'settings.fact.project',
  language: 'settings.fact.language',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function SettingsPanel({ isOpen, onClose }: Props) {
  const { config, isLoaded, loadConfig, updateConfig, setMaxTokens } = useConfigStore()
  const t = useT()
  const factLabel = (key: string) => (FACT_LABELS[key] ? t(FACT_LABELS[key]) : key)

  const [userName, setUserName] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState('')
  // Local draft for the Custom tokens input so the user can type freely
  // (including transient empty / partial values) before we clamp and persist
  // on commit. Synced to `config.maxTokens` whenever the persisted value
  // changes externally (e.g. S/M/L chips set it, or initial config load).
  const [customDraft, setCustomDraft] = useState<string>(
    String(config.maxTokens ?? DEFAULT_MAX_TOKENS)
  )
  const customInputRef = useRef<HTMLInputElement>(null)

  // ── Drafts for the free-text config fields ─────────────────────────────────
  // Typing must not write config.toml (and broadcast to every window) on each
  // keystroke, nor persist a half-typed API key. Committed on blur / Enter;
  // resynced whenever the stored value changes.
  const [drafts, setDrafts] = useState<Record<DraftField, string>>(() => ({
    apiKey: storedDraftValue(config, 'apiKey'),
    model: storedDraftValue(config, 'model'),
    baseUrl: storedDraftValue(config, 'baseUrl'),
  }))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts({
      apiKey: '',
      model: config.model,
      baseUrl: config.baseUrl ?? DEFAULT_OLLAMA_URL,
    })
  }, [config.hasApiKey, config.model, config.baseUrl])

  // ── Memory (learned facts + chat history) ──────────────────────────────────
  const [facts, setFacts] = useState<Record<string, string>>({})
  // Destructive actions need a second click within CONFIRM_MS (no native
  // confirm() dialog — it would block the Tauri event loop).
  const [confirming, setConfirming] = useState<'history' | 'all' | null>(null)
  const [memoryMsg, setMemoryMsg] = useState('')
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isOpen) return
    invoke<Record<string, string>>('get_all_user_facts')
      .then(setFacts)
      .catch(() => setFacts({}))
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [isOpen])

  const forgetFact = useCallback(
    async (key: string) => {
      try {
        await invoke('delete_user_fact', { key })
        setFacts((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        if (NAME_FACT_KEYS.includes(key)) setUserName('')
        setMemoryMsg('')
      } catch (err) {
        setMemoryMsg(t('settings.memory.forgetError', { fact: key, error: String(err) }))
      }
    },
    [t]
  )

  const handleClear = useCallback(
    async (kind: 'history' | 'all') => {
      if (confirming !== kind) {
        setConfirming(kind)
        setMemoryMsg('')
        if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
        confirmTimerRef.current = setTimeout(() => setConfirming(null), CONFIRM_MS)
        return
      }
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirming(null)
      try {
        await invoke('clear_conversations')
        if (kind === 'all') {
          await invoke('clear_user_facts')
          setFacts({})
          setUserName('')
        }
        setMemoryMsg(
          t(kind === 'all' ? 'settings.memory.allForgotten' : 'settings.memory.historyCleared')
        )
      } catch (err) {
        setMemoryMsg(t('settings.memory.clearError', { error: String(err) }))
      }
    },
    [confirming, t]
  )

  // ── Start with system (autostart) ──────────────────────────────────────────
  // `undefined` while loading, `null` when unavailable (portable mode, or the
  // OS launcher could not be queried).
  const [autostart, setAutostart] = useState<boolean | null | undefined>(undefined)
  const [autostartError, setAutostartError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    invoke<boolean | null>('autostart_status')
      .then(setAutostart)
      .catch((err) => {
        setAutostart(null)
        setAutostartError(t('settings.autostart.readError', { error: String(err) }))
      })
  }, [isOpen, t])

  const toggleAutostart = useCallback(async (enabled: boolean) => {
    setAutostartError('')
    try {
      await invoke(enabled ? 'enable_autostart' : 'disable_autostart')
      setAutostart(enabled)
    } catch (err) {
      setAutostartError(String(err))
    }
  }, [])

  // ── Load config + user name on first open ──────────────────────────────────
  useEffect(() => {
    if (!isLoaded) loadConfig()
  }, [isLoaded, loadConfig])

  useEffect(() => {
    if (!isOpen) return
    // Same `name` fact the chat extraction in src/ai/memory.ts writes, so the
    // prompt never carries two competing names.
    invoke<string | null>('get_user_fact', { key: 'name' }).then((v) => {
      if (v) setUserName(v)
    })
  }, [isOpen])

  // ── Expand / collapse the Tauri window ────────────────────────────────────
  usePanelWindow(isOpen, SETTINGS_W, SETTINGS_H, 'SettingsPanel')

  // ── Escape key closes without saving ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // ── Persist user name on blur ─────────────────────────────────────────────
  const handleUserNameBlur = useCallback(() => {
    const value = userName.trim()
    // An empty field would store `name=` in every prompt; skip it.
    if (!value) return
    invoke('set_user_fact', { key: 'name', value })
  }, [userName])

  // ── Custom response-length input: sync draft + commit ─────────────────────
  // Whenever the persisted value changes (initial load, or another chip is
  // clicked) refresh the draft so the input never lags behind reality.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomDraft(String(config.maxTokens ?? DEFAULT_MAX_TOKENS))
  }, [config.maxTokens])

  // Parse, clamp to [min, max], persist. On invalid input snap back to the
  // last-known good value so the field never holds garbage.
  const commitCustomTokens = useCallback(() => {
    const parsed = Number.parseInt(customDraft, 10)
    if (!Number.isFinite(parsed)) {
      setCustomDraft(String(config.maxTokens ?? DEFAULT_MAX_TOKENS))
      return
    }
    const clamped = Math.max(MAX_TOKENS_BOUNDS.min, Math.min(MAX_TOKENS_BOUNDS.max, parsed))
    setCustomDraft(String(clamped))
    if (clamped !== config.maxTokens) {
      void setMaxTokens(clamped)
    }
  }, [customDraft, config.maxTokens, setMaxTokens])

  // ── Free-text fields: commit the draft on blur / Enter ─────────────────────
  const commitDraft = useCallback(
    (field: DraftField) => {
      const value = drafts[field].trim()
      if (value === storedDraftValue(config, field)) return
      // An empty key input means "keep the stored key"; removing it is the
      // explicit Remove button.
      if (field === 'model' && !value) {
        // A model is required — snap back instead of saving an empty one.
        setDrafts((d) => ({ ...d, model: config.model }))
        return
      }
      // An emptied base URL is cleared (null) rather than stored as ''.
      void updateConfig({ [field]: value || null })
      // Once handed to the backend the key leaves the WebView; the input goes
      // back to the "saved" placeholder.
      if (field === 'apiKey') setDrafts((d) => ({ ...d, apiKey: '' }))
    },
    [drafts, config, updateConfig]
  )

  // ── Provider change: reset model to provider default (one write) ──────────
  const handleProviderChange = useCallback(
    (p: string) => {
      void updateConfig({
        provider: p as AIConfig['provider'],
        model: PROVIDER_DEFAULTS[p]?.model ?? config.model,
      })
    },
    [config.model, updateConfig]
  )

  // ── Test connection ────────────────────────────────────────────────────────
  // Uses the drafts too, so a key typed and tested without leaving the field
  // is the one that gets tested.
  const handleTest = useCallback(async () => {
    setTestStatus('loading')
    setTestMsg('')
    try {
      const provider = createAIProvider({
        ...config,
        apiKey: drafts.apiKey.trim() || undefined,
        model: drafts.model.trim() || config.model,
        baseUrl: drafts.baseUrl.trim() || undefined,
      })
      const system = buildContextBlock({
        facts: userName ? { name: userName } : {},
        maxTokens: config.maxTokens,
      })
      const reply = await provider.sendMessage(
        [{ role: 'user', content: 'Say "OK" in one word.' }],
        system
      )
      setTestStatus('ok')
      setTestMsg(reply.trim().slice(0, 80))
    } catch (err) {
      setTestStatus('error')
      setTestMsg(err instanceof Error ? err.message : String(err))
    }
  }, [config, drafts, userName])

  if (!isOpen) return null

  const isOllama = config.provider === 'ollama'
  const hasCredentials = isOllama || !!config.hasApiKey
  const status: 'connected' | 'untested' | 'disconnected' = !hasCredentials
    ? 'disconnected'
    : testStatus === 'ok'
      ? 'connected'
      : 'untested'
  const help = PROVIDER_HELP[config.provider]

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={styles.header}>
          <span style={styles.title}>{t('settings.title')}</span>
          <button style={styles.closeBtn} onClick={onClose} title={t('common.close')}>
            ✕
          </button>
        </div>

        {/* ── Status badge ────────────────────────────────────────────────── */}
        <div
          style={{
            ...styles.statusBadge,
            ...(status === 'connected' ? styles.statusOk : {}),
            ...(status === 'untested' ? styles.statusWarn : {}),
            ...(status === 'disconnected' ? styles.statusError : {}),
          }}
        >
          {t(`settings.status.${status}`)}
        </div>

        {/* ── Provider ────────────────────────────────────────────────────── */}
        <label style={styles.label}>{t('settings.provider')}</label>
        <select
          style={styles.select}
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          <option value="gemini">Google (Gemini)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="ollama">Ollama (local)</option>
          <option value="nvidia">NVIDIA NIM</option>
        </select>

        {/* ── Model ───────────────────────────────────────────────────────── */}
        <label style={styles.label}>{t('settings.model')}</label>
        <input
          style={styles.input}
          type="text"
          value={drafts.model}
          onChange={(e) => setDrafts((d) => ({ ...d, model: e.target.value }))}
          onBlur={() => commitDraft('model')}
          onKeyDown={blurOnEnter}
          placeholder={PROVIDER_DEFAULTS[config.provider]?.model ?? ''}
        />

        {/* ── API key (hidden for Ollama) ──────────────────────────────────── */}
        {!isOllama && (
          <>
            <label style={styles.label}>{t('settings.apiKey')}</label>
            <div style={styles.keyRow}>
              <input
                style={{ ...styles.input, flex: 1 }}
                type={showKey ? 'text' : 'password'}
                value={drafts.apiKey}
                onChange={(e) => setDrafts((d) => ({ ...d, apiKey: e.target.value }))}
                onBlur={() => commitDraft('apiKey')}
                onKeyDown={blurOnEnter}
                placeholder={
                  config.hasApiKey
                    ? t('settings.apiKey.saved')
                    : (PROVIDER_DEFAULTS[config.provider]?.placeholder ?? '')
                }
                autoComplete="off"
              />
              <button
                style={styles.eyeBtn}
                onClick={() => setShowKey((v) => !v)}
                title={t(showKey ? 'settings.apiKey.hide' : 'settings.apiKey.show')}
              >
                {showKey ? '🙈' : '👁'}
              </button>
              {config.hasApiKey && (
                <button
                  style={styles.eyeBtn}
                  onClick={() => void updateConfig({ apiKey: null })}
                  title={t('settings.apiKey.remove')}
                >
                  🗑
                </button>
              )}
            </div>
          </>
        )}

        {/* ── Ollama base URL ──────────────────────────────────────────────── */}
        {isOllama && (
          <>
            <label style={styles.label}>{t('settings.baseUrl')}</label>
            <input
              style={styles.input}
              type="text"
              value={drafts.baseUrl}
              onChange={(e) => setDrafts((d) => ({ ...d, baseUrl: e.target.value }))}
              onBlur={() => commitDraft('baseUrl')}
              onKeyDown={blurOnEnter}
              placeholder={DEFAULT_OLLAMA_URL}
            />
          </>
        )}

        {/* ── Helper link (only when credentials missing) ─────────────────── */}
        {!hasCredentials && help && (
          <button
            style={styles.helperLink}
            onClick={() => invoke('open_url', { url: help.url })}
            title={help.url}
          >
            ↗ {t(help.label)}
          </button>
        )}

        {/* ── User name ───────────────────────────────────────────────────── */}
        <label style={styles.label}>{t('settings.userName')}</label>
        <input
          style={styles.input}
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          onBlur={handleUserNameBlur}
          placeholder={t('settings.userName.placeholder')}
        />

        {/* ── Language ────────────────────────────────────────────────────── */}
        <label style={styles.label}>{t('settings.language')}</label>
        <select
          style={styles.select}
          value={config.language ?? 'auto'}
          onChange={(e) =>
            void updateConfig({
              language: e.target.value === 'auto' ? null : (e.target.value as AIConfig['language']),
            })
          }
        >
          <option value="auto">{t('settings.language.auto')}</option>
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_NAMES[locale]}
            </option>
          ))}
        </select>

        {/* ── Start with system ───────────────────────────────────────────── */}
        <label
          style={{
            ...styles.toggleRow,
            ...(autostart == null ? styles.toggleRowDisabled : {}),
          }}
          title={autostart === null ? t('settings.autostart.portableHint') : undefined}
        >
          <input
            type="checkbox"
            checked={autostart === true}
            disabled={autostart == null}
            onChange={(e) => void toggleAutostart(e.target.checked)}
          />
          {t('settings.autostart')}
          {autostart === null && ` ${t('settings.autostart.portable')}`}
        </label>
        {autostartError !== '' && <p style={styles.memoryHint}>{autostartError}</p>}
        <label style={styles.toggleRow}>
          <input
            type="checkbox"
            checked={config.checkUpdates !== false}
            onChange={(e) => void updateConfig({ checkUpdates: e.target.checked ? null : false })}
          />
          {t('settings.checkUpdates')}
        </label>

        {/* ── Response length ─────────────────────────────────────────────── */}
        <label style={styles.label}>{t('settings.length')}</label>
        <div style={styles.tokenRow}>
          {RESPONSE_LENGTH_OPTIONS.map(({ key, label, hint }) => {
            const active = maxTokensPreset(config.maxTokens) === key
            return (
              <button
                key={key}
                style={{
                  ...styles.tokenBtn,
                  ...(active ? styles.tokenBtnActive : {}),
                }}
                onClick={() => {
                  // Named presets persist directly; the Custom chip just
                  // focuses the inline input below so the user can type a
                  // value (no preset to persist for 'custom').
                  if (key === 'custom') {
                    customInputRef.current?.focus()
                    customInputRef.current?.select()
                  } else {
                    void setMaxTokens(MAX_TOKENS_PRESETS[key])
                  }
                }}
                title={t(hint, { tokens: CUSTOM_RANGE })}
              >
                {label ? t(label) : '⚙'}
              </button>
            )
          })}
        </div>
        <div style={styles.customRow}>
          <input
            ref={customInputRef}
            style={{
              ...styles.customInput,
              ...(maxTokensPreset(config.maxTokens) === 'custom' ? styles.customInputActive : {}),
            }}
            type="number"
            inputMode="numeric"
            min={MAX_TOKENS_BOUNDS.min}
            max={MAX_TOKENS_BOUNDS.max}
            step={32}
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            onBlur={commitCustomTokens}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitCustomTokens()
                customInputRef.current?.blur()
              }
            }}
            aria-label={t('settings.length.customAria')}
          />
          <span style={styles.customUnit}>tokens</span>
        </div>
        <p style={styles.tokenHint}>
          {t(
            RESPONSE_LENGTH_OPTIONS.find((o) => o.key === maxTokensPreset(config.maxTokens))
              ?.hint ?? 'settings.length.medium',
            { tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS }
          )}
        </p>

        {/* ── Test button ─────────────────────────────────────────────────── */}
        <button
          style={{
            ...styles.testBtn,
            ...(testStatus === 'ok' ? styles.testOk : {}),
            ...(testStatus === 'error' ? styles.testError : {}),
          }}
          onClick={handleTest}
          disabled={testStatus === 'loading'}
        >
          {t(testStatus === 'loading' ? 'settings.testing' : 'settings.test')}
        </button>

        {testMsg !== '' && (
          <p
            style={{
              ...styles.testFeedback,
              color: testStatus === 'ok' ? '#4caf50' : '#f44336',
            }}
          >
            {testMsg}
          </p>
        )}

        {/* ── Memory ──────────────────────────────────────────────────────── */}
        <div style={styles.divider} />
        <label style={styles.label}>{t('settings.memory')}</label>
        {Object.keys(facts).length === 0 ? (
          <p style={styles.memoryHint}>{t('settings.memory.empty')}</p>
        ) : (
          <ul style={styles.factList}>
            {Object.entries(facts).map(([key, value]) => (
              <li key={key} style={styles.factRow}>
                <span style={styles.factText} title={value}>
                  <span style={styles.factKey}>{factLabel(key)}</span> {value}
                </span>
                <button
                  style={styles.factDelete}
                  onClick={() => void forgetFact(key)}
                  title={t('settings.memory.forget', { fact: factLabel(key) })}
                  aria-label={t('settings.memory.forget', { fact: factLabel(key) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={styles.memoryActions}>
          <button
            style={{
              ...styles.memoryBtn,
              ...(confirming === 'history' ? styles.memoryBtnConfirm : {}),
            }}
            onClick={() => void handleClear('history')}
            title={t('settings.memory.clearHistoryHint')}
          >
            {t(
              confirming === 'history' ? 'settings.memory.confirm' : 'settings.memory.clearHistory'
            )}
          </button>
          <button
            style={{
              ...styles.memoryBtn,
              ...(confirming === 'all' ? styles.memoryBtnConfirm : {}),
            }}
            onClick={() => void handleClear('all')}
            title={t('settings.memory.forgetAllHint')}
          >
            {t(confirming === 'all' ? 'settings.memory.confirm' : 'settings.memory.forgetAll')}
          </button>
        </div>
        {memoryMsg !== '' && <p style={styles.memoryHint}>{memoryMsg}</p>}

        {/* ── Quit ────────────────────────────────────────────────────────── */}
        <div style={styles.divider} />
        <button style={styles.quitBtn} onClick={() => invoke('quit_app')}>
          {t('settings.quit')}
        </button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    background: 'rgba(20, 20, 30, 0.96)',
    color: '#e0e0e0',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    boxSizing: 'border-box',
    width: '280px',
    // The Memory section can push the content past the fixed window height;
    // scroll inside the card instead of clipping it.
    maxHeight: SETTINGS_H - 8,
    overflowY: 'auto',
    scrollbarWidth: 'thin',
    scrollbarColor: '#444 transparent',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    color: '#fff',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 2px',
  },
  label: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: 4,
  },
  select: {
    background: '#1e1e2e',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 13,
    width: '100%',
  },
  input: {
    background: '#1e1e2e',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
  },
  keyRow: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  eyeBtn: {
    background: '#1e1e2e',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 14,
    padding: '4px 6px',
  },
  tokenRow: {
    display: 'flex',
    gap: 6,
    marginTop: 2,
  },
  tokenBtn: {
    flex: 1,
    background: '#1e1e2e',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    padding: '6px 0',
  },
  tokenBtnActive: {
    background: '#3a3a6c',
    borderColor: '#7878cc',
    color: '#cceeff',
  },
  tokenHint: {
    margin: '4px 0 0',
    fontSize: 10,
    color: '#777',
    textAlign: 'center',
  },
  customRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  customInput: {
    background: '#1e1e2e',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 13,
    flex: 1,
    minWidth: 0,
    boxSizing: 'border-box',
    fontVariantNumeric: 'tabular-nums',
  },
  customInputActive: {
    borderColor: '#7878cc',
    background: '#23234c',
    color: '#cceeff',
  },
  customUnit: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  testBtn: {
    marginTop: 8,
    background: '#3a3a5c',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: 8,
    padding: '7px 0',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  testOk: {
    background: '#1b4332',
    borderColor: '#4caf50',
    color: '#a5d6a7',
  },
  testError: {
    background: '#4a1414',
    borderColor: '#f44336',
    color: '#ef9a9a',
  },
  testFeedback: {
    margin: 0,
    fontSize: 11,
    wordBreak: 'break-word',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: 6,
    textAlign: 'center',
    border: '1px solid transparent',
  },
  statusOk: {
    background: '#1b4332',
    borderColor: '#4caf50',
    color: '#a5d6a7',
  },
  statusWarn: {
    background: '#3a3520',
    borderColor: '#caa64c',
    color: '#e6cf80',
  },
  statusError: {
    background: '#4a1414',
    borderColor: '#f44336',
    color: '#ef9a9a',
  },
  helperLink: {
    background: 'transparent',
    color: '#7dd3fc',
    border: '1px dashed #3a4a5e',
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'left',
    marginTop: 2,
  },
  divider: {
    borderTop: '1px solid #333',
    marginTop: 8,
  },
  memoryHint: {
    margin: 0,
    fontSize: 11,
    color: '#888',
  },
  factList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  factRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#1e1e2e',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '3px 4px 3px 8px',
  },
  factText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  factKey: {
    color: '#888',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  factDelete: {
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1,
    padding: '2px 4px',
  },
  memoryActions: {
    display: 'flex',
    gap: 6,
    marginTop: 2,
  },
  memoryBtn: {
    flex: 1,
    background: 'transparent',
    color: '#d9a066',
    border: '1px solid #6b5233',
    borderRadius: 6,
    padding: '5px 0',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  },
  memoryBtnConfirm: {
    background: '#4a1414',
    borderColor: '#f44336',
    color: '#ef9a9a',
  },
  quitBtn: {
    background: 'transparent',
    color: '#e05555',
    border: '1px solid #e05555',
    borderRadius: 8,
    padding: '7px 0',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    fontSize: 12,
    color: '#ccc',
    cursor: 'pointer',
  },
  toggleRowDisabled: {
    color: '#666',
    cursor: 'default',
  },
}
