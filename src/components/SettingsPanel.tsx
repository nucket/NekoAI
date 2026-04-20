import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { useConfigStore } from '../store/configStore';
import { createAIProvider, buildContextBlock } from '../ai';

// ─── Layout constants ─────────────────────────────────────────────────────────

const PANEL_W = 280;
const PANEL_H = 500;
const SPRITE_SIZE = 32;

// ─── Provider defaults ────────────────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<string, { model: string; placeholder: string }> = {
  anthropic: { model: 'claude-haiku-4-5-20251001', placeholder: 'sk-ant-…'  },
  openai:    { model: 'gpt-4o-mini',               placeholder: 'sk-…'       },
  ollama:    { model: 'llama3',                     placeholder: '(not required)' },
  gemini:    { model: 'gemini-1.5-flash',           placeholder: 'AIza…'     },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: Props) {
  const { config, isLoaded, loadConfig, setProvider, setApiKey, setModel, setBaseUrl } =
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
      try {
        const [pos, monitor, cursor] = await Promise.all([
          win.outerPosition(),
          currentMonitor(),
          invoke<{ x: number; y: number }>('get_cursor_pos'),
        ]);
        if (cancelled) return;
        setSavedPos({ x: pos.x, y: pos.y });

        // Physical bounds of the active monitor
        const scale  = monitor?.scaleFactor ?? window.devicePixelRatio ?? 1;
        const monX   = monitor?.position.x  ?? 0;
        const monY   = monitor?.position.y  ?? 0;
        const monW   = monitor?.size.width  ?? window.screen.availWidth  * scale;
        const monH   = monitor?.size.height ?? window.screen.availHeight * scale;

        // Panel physical size
        const panelPhysW = PANEL_W * scale;
        const panelPhysH = PANEL_H * scale;

        // Quadrant relative to the current monitor
        const openBelow = (cursor.y - monY) < monH / 2;
        const openRight = (cursor.x - monX) < monW / 2;

        let x = cursor.x + (openRight ? 0 : -panelPhysW);
        let y = cursor.y + (openBelow ? 0 : -panelPhysH);

        // Clamp inside the monitor
        x = Math.max(monX, Math.min(x, monX + monW - panelPhysW));
        y = Math.max(monY, Math.min(y, monY + monH - panelPhysH));

        await win.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
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
          <option value="gemini">Google (Gemini)</option>
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
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
  },
  panel: {
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
    width:           '280px',
    overflowY:       'hidden',
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
