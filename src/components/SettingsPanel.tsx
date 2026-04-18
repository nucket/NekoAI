import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { useConfigStore } from '../store/configStore';
import { createAIProvider, buildContextBlock } from '../ai';

// ─── Layout constants ─────────────────────────────────────────────────────────

const PANEL_W = 280;
const PANEL_H = 360;
const SPRITE_SIZE = 48;

// ─── Provider defaults ────────────────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<string, { model: string; placeholder: string }> = {
  anthropic: { model: 'claude-haiku-4-5-20251001', placeholder: 'sk-ant-…' },
  openai:    { model: 'gpt-4o-mini',               placeholder: 'sk-…'      },
  ollama:    { model: 'llama3',                     placeholder: '(not required)' },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: Props) {
  const { config, isLoaded, loadConfig, setProvider, setApiKey, setModel, setBaseUrl, setPetSize } =
    useConfigStore();

  const [userName, setUserName]     = useState('');
  const [showKey, setShowKey]       = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [testMsg, setTestMsg]       = useState('');
  const [savedPos, setSavedPos]     = useState<{ x: number; y: number } | null>(null);

  // ── Load config + user name on first open ──────────────────────────────────
  useEffect(() => {
    if (!isLoaded) loadConfig();
  }, [isLoaded, loadConfig]);

  useEffect(() => {
    if (!isOpen) return;
    invoke<string | null>('get_user_fact', { key: 'userName' }).then((v) => {
      if (v) setUserName(v);
    });
  }, [isOpen]);

  // ── Expand / collapse the Tauri window ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const win = getCurrentWindow();

    async function expand() {
      const sz = useConfigStore.getState().config.petSize ?? SPRITE_SIZE;
      try {
        const [pos, scale] = await Promise.all([win.outerPosition(), win.scaleFactor()]);
        if (cancelled) return;
        setSavedPos({ x: pos.x, y: pos.y });
        const newX = pos.x - Math.round(((PANEL_W - sz) / 2) * scale);
        const newY = pos.y - Math.round((PANEL_H - sz) * scale);
        await win.setPosition(new PhysicalPosition(newX, newY));
        await invoke('resize_window', { width: PANEL_W, height: PANEL_H });
      } catch (err) {
        console.error('[SettingsPanel] expand error:', err);
      }
    }

    async function collapse() {
      if (!savedPos) return;
      const sz = useConfigStore.getState().config.petSize ?? SPRITE_SIZE;
      const snap = { ...savedPos };
      setSavedPos(null);
      try {
        await invoke('resize_window', { width: sz, height: sz });
        if (!cancelled) await win.setPosition(new PhysicalPosition(snap.x, snap.y));
      } catch (err) {
        console.error('[SettingsPanel] collapse error:', err);
      }
    }

    if (isOpen) expand(); else collapse();

    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Escape key closes without saving ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Persist user name on blur ─────────────────────────────────────────────
  const handleUserNameBlur = useCallback(() => {
    invoke('set_user_fact', { key: 'userName', value: userName });
  }, [userName]);

  // ── Provider change: reset model to provider default ──────────────────────
  const handleProviderChange = useCallback(
    (p: string) => {
      setProvider(p as 'anthropic' | 'openai' | 'ollama');
      setModel(PROVIDER_DEFAULTS[p]?.model ?? config.model);
    },
    [config.model, setProvider, setModel]
  );

  // ── Test connection ────────────────────────────────────────────────────────
  const handleTest = useCallback(async () => {
    setTestStatus('loading');
    setTestMsg('');
    try {
      const provider = createAIProvider(config);
      const system   = buildContextBlock('Neko', userName ? { name: userName } : {});
      const reply    = await provider.sendMessage(
        [{ role: 'user', content: 'Say "OK" in one word.' }],
        system
      );
      setTestStatus('ok');
      setTestMsg(reply.trim().slice(0, 80));
    } catch (err) {
      setTestStatus('error');
      setTestMsg(err instanceof Error ? err.message : String(err));
    }
  }, [config, userName]);

  if (!isOpen) return null;

  const isOllama = config.provider === 'ollama';

  return (
    <div style={styles.overlay} onClick={(e) => e.stopPropagation()}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <span style={styles.title}>⚙ Settings</span>
        <button style={styles.closeBtn} onClick={onClose} title="Close">✕</button>
      </div>

      {/* ── Provider ────────────────────────────────────────────────────── */}
      <label style={styles.label}>AI Provider</label>
      <select
        style={styles.select}
        value={config.provider}
        onChange={(e) => handleProviderChange(e.target.value)}
      >
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="openai">OpenAI (GPT)</option>
        <option value="ollama">Ollama (local)</option>
      </select>

      {/* ── Model ───────────────────────────────────────────────────────── */}
      <label style={styles.label}>Model</label>
      <input
        style={styles.input}
        type="text"
        value={config.model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={PROVIDER_DEFAULTS[config.provider]?.model ?? ''}
      />

      {/* ── API key (hidden for Ollama) ──────────────────────────────────── */}
      {!isOllama && (
        <>
          <label style={styles.label}>API Key</label>
          <div style={styles.keyRow}>
            <input
              style={{ ...styles.input, flex: 1 }}
              type={showKey ? 'text' : 'password'}
              value={config.apiKey ?? ''}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={PROVIDER_DEFAULTS[config.provider]?.placeholder ?? ''}
              autoComplete="off"
            />
            <button
              style={styles.eyeBtn}
              onClick={() => setShowKey((v) => !v)}
              title={showKey ? 'Hide' : 'Show'}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </>
      )}

      {/* ── Ollama base URL ──────────────────────────────────────────────── */}
      {isOllama && (
        <>
          <label style={styles.label}>Base URL</label>
          <input
            style={styles.input}
            type="text"
            value={config.baseUrl ?? 'http://localhost:11434'}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
        </>
      )}

      {/* ── User name ───────────────────────────────────────────────────── */}
      <label style={styles.label}>Your Name (optional)</label>
      <input
        style={styles.input}
        type="text"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        onBlur={handleUserNameBlur}
        placeholder="e.g. Alex"
      />

      {/* ── Pet Size ────────────────────────────────────────────────────── */}
      <label style={styles.label}>Pet Size</label>
      <div style={styles.sizeRow}>
        {([{ label: 'S', value: 32 }, { label: 'M', value: 48 }, { label: 'L', value: 64 }, { label: 'XL', value: 80 }] as const).map(({ label, value }) => (
          <button
            key={value}
            style={{
              ...styles.sizeBtn,
              ...((config.petSize ?? 48) === value ? styles.sizeBtnActive : {}),
            }}
            onClick={() => setPetSize(value)}
            title={`${value}px`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Test button ─────────────────────────────────────────────────── */}
      <button
        style={{
          ...styles.testBtn,
          ...(testStatus === 'ok'    ? styles.testOk    : {}),
          ...(testStatus === 'error' ? styles.testError : {}),
        }}
        onClick={handleTest}
        disabled={testStatus === 'loading'}
      >
        {testStatus === 'loading' ? 'Testing…' : 'Test connection'}
      </button>

      {testMsg !== '' && (
        <p style={{
          ...styles.testFeedback,
          color: testStatus === 'ok' ? '#4caf50' : '#f44336',
        }}>
          {testMsg}
        </p>
      )}

      {/* ── Quit ────────────────────────────────────────────────────────── */}
      <div style={styles.divider} />
      <button
        style={styles.quitBtn}
        onClick={() => invoke('quit_app')}
      >
        Quit NekoAI
      </button>
    </div>
  );
}

// ─── Gear trigger button ──────────────────────────────────────────────────────

interface GearProps {
  onClick: () => void;
}

export function SettingsGear({ onClick }: GearProps) {
  return (
    <button
      style={styles.gear}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="Open settings"
    >
      ⚙
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'fixed',
    inset:           0,
    zIndex:          100,
    background:      'rgba(20, 20, 30, 0.96)',
    color:           '#e0e0e0',
    borderRadius:    12,
    padding:         '12px 14px',
    display:         'flex',
    flexDirection:   'column',
    gap:             6,
    fontFamily:      'system-ui, sans-serif',
    fontSize:        13,
    boxSizing:       'border-box',
    overflowY:       'auto',
  },
  header: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
    marginBottom:    4,
  },
  title: {
    fontWeight:      700,
    fontSize:        14,
    color:           '#fff',
  },
  closeBtn: {
    background:      'transparent',
    border:          'none',
    color:           '#aaa',
    cursor:          'pointer',
    fontSize:        16,
    lineHeight:      1,
    padding:         '0 2px',
  },
  label: {
    fontSize:        11,
    color:           '#888',
    textTransform:   'uppercase',
    letterSpacing:   '0.05em',
    marginTop:       4,
  },
  select: {
    background:      '#1e1e2e',
    color:           '#e0e0e0',
    border:          '1px solid #444',
    borderRadius:    6,
    padding:         '5px 8px',
    fontSize:        13,
    width:           '100%',
  },
  input: {
    background:      '#1e1e2e',
    color:           '#e0e0e0',
    border:          '1px solid #444',
    borderRadius:    6,
    padding:         '5px 8px',
    fontSize:        13,
    width:           '100%',
    boxSizing:       'border-box',
  },
  keyRow: {
    display:         'flex',
    gap:             4,
    alignItems:      'center',
  },
  eyeBtn: {
    background:      '#1e1e2e',
    border:          '1px solid #444',
    borderRadius:    6,
    color:           '#aaa',
    cursor:          'pointer',
    fontSize:        14,
    padding:         '4px 6px',
  },
  testBtn: {
    marginTop:       8,
    background:      '#3a3a5c',
    color:           '#e0e0e0',
    border:          '1px solid #555',
    borderRadius:    8,
    padding:         '7px 0',
    cursor:          'pointer',
    fontSize:        13,
    fontWeight:      600,
  },
  testOk: {
    background:      '#1b4332',
    borderColor:     '#4caf50',
    color:           '#a5d6a7',
  },
  testError: {
    background:      '#4a1414',
    borderColor:     '#f44336',
    color:           '#ef9a9a',
  },
  testFeedback: {
    margin:          0,
    fontSize:        11,
    wordBreak:       'break-word',
  },
  divider: {
    borderTop:       '1px solid #333',
    marginTop:       8,
  },
  quitBtn: {
    background:      'transparent',
    color:           '#e05555',
    border:          '1px solid #e05555',
    borderRadius:    8,
    padding:         '7px 0',
    cursor:          'pointer',
    fontSize:        13,
    fontWeight:      600,
    marginBottom:    4,
  },
  sizeRow: {
    display:       'flex',
    gap:           6,
    flexWrap:      'wrap' as const,
  },
  sizeBtn: {
    background:    '#1e1e2e',
    border:        '1px solid #444',
    borderRadius:  6,
    color:         '#aaa',
    cursor:        'pointer',
    fontSize:      12,
    fontWeight:    600,
    padding:       '4px 10px',
    flex:          1,
  },
  sizeBtnActive: {
    background:    '#3a3a6c',
    borderColor:   '#7878cc',
    color:         '#cceeff',
  },
  gear: {
    position:        'absolute',
    bottom:          2,
    right:           2,
    background:      'rgba(0,0,0,0.5)',
    border:          'none',
    borderRadius:    '50%',
    width:           20,
    height:          20,
    fontSize:        11,
    lineHeight:      1,
    cursor:          'pointer',
    color:           '#ccc',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          10,
  },
};
