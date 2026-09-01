import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

interface AutoclawModelInfo {
  id: string;
  name: string;
  context_window?: number | null;
  max_tokens?: number | null;
}

interface AutoclawStatus {
  installed: boolean;
  state_dir: string;
  email?: string | null;
  user_id?: number | null;
  is_guest?: boolean | null;
  token_issued_at?: number | null;
  token_expires_at?: number | null;
  token_valid: boolean;
  app_version?: string | null;
  primary_model?: string | null;
  models: AutoclawModelInfo[];
  quota_note?: string | null;
}

type BridgeState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'running'; info: string }
  | { kind: 'stopped'; error: string }
  | { kind: 'starting' };

function formatUnix(seconds?: number | null): string {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleString([], {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function AutoclawCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AutoclawStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridge, setBridge] = useState<BridgeState>({ kind: 'idle' });
  const [showModels, setShowModels] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const value = await invoke<AutoclawStatus>('get_autoclaw_status');
      setStatus(value);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  const refreshBridge = useCallback(async () => {
    setBridge({ kind: 'checking' });
    try {
      const value = await invoke<{ ok: boolean; brokerPort: number | null }>('autoclaw_bridge_status');
      setBridge({ kind: 'running', info: `127.0.0.1:8787${value?.brokerPort ? ` → broker :${value.brokerPort}` : ''}` });
    } catch (e) {
      setBridge({ kind: 'stopped', error: String(e) });
    }
  }, []);

  const startBridge = useCallback(async () => {
    setBridge({ kind: 'starting' });
    try {
      const result = await invoke<string>('autoclaw_bridge_start');
      await refreshBridge();
      setBridge((prev) => (prev.kind === 'running' ? prev : { kind: 'running', info: result }));
    } catch (e) {
      setBridge({ kind: 'stopped', error: String(e) });
    }
  }, [refreshBridge]);

  useEffect(() => {
    void refresh();
    void refreshBridge();
  }, [refresh, refreshBridge]);

  const expText = formatUnix(status?.token_expires_at);
  const hoursLeft = status?.token_expires_at
    ? Math.max(0, Math.round((status.token_expires_at * 1000 - Date.now()) / 3600000))
    : 0;

  return (
    <div
      className="main-card"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '16px 18px',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🦞</span>
        <strong style={{ fontSize: 15 }}>AutoClaw</strong>
        {status?.app_version && (
          <span style={{ opacity: 0.55, fontSize: 12 }}>v{status.app_version}</span>
        )}
        <span style={{ flex: 1 }} />
        <button
          className="header-action-btn"
          style={{ padding: '2px 10px' }}
          onClick={() => { void refresh(); void refreshBridge(); }}
        >
          ↻
        </button>
      </div>

      {!loaded && <div style={{ opacity: 0.6 }}>{t('autoclaw.loading', 'Загрузка…')}</div>}

      {loaded && error && <div style={{ color: '#e05a5a' }}>{error}</div>}

      {loaded && !error && status && !status.installed && (
        <div style={{ opacity: 0.6 }}>
          {t('autoclaw.notInstalled', 'AutoClaw не найден в системе')}
        </div>
      )}

      {loaded && !error && status?.installed && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13 }}>
            <span>
              👤 {status.email ?? '—'}
              {status.is_guest ? ' (guest)' : ''}
              {status.user_id != null && (
                <span style={{ opacity: 0.5 }}> · id {status.user_id}</span>
              )}
            </span>
            <span>
              {status.token_valid ? '🟢' : '🔴'}{' '}
              {status.token_valid
                ? t('autoclaw.tokenValid', 'токен активен до {{exp}} (≈{{h}} ч)', {
                    exp: expText,
                    h: hoursLeft,
                  })
                : t('autoclaw.tokenExpired', 'токен истёк — запусти AutoClaw')}{' '}
              {status.token_valid && `(${expText})`}
            </span>
          </div>

          <div style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            <span>
              🧠 {t('autoclaw.primaryModel', 'основная модель')}:{' '}
              <strong>{status.primary_model ?? '—'}</strong>
            </span>
            <span>
              📦 {t('autoclaw.models', 'моделей')}: {status.models.length}
              <button
                className="header-action-btn"
                style={{ padding: '0 8px', marginLeft: 6, fontSize: 11 }}
                onClick={() => setShowModels((v) => !v)}
              >
                {showModels ? '▲' : '▼'}
              </button>
            </span>
          </div>

          {showModels && (
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.7 }}>
              {status.models.map((model) => (
                <div key={model.id}>
                  <code>{model.id}</code> — {model.name} · ctx{' '}
                  {model.context_window?.toLocaleString() ?? '—'} · out{' '}
                  {model.max_tokens?.toLocaleString() ?? '—'}
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
            }}
          >
            <button
              className="header-action-btn"
              style={{ padding: '4px 14px' }}
              disabled={bridge.kind === 'starting' || bridge.kind === 'checking'}
              onClick={() => void startBridge()}
            >
              {bridge.kind === 'starting'
                ? t('autoclaw.starting', 'Запуск…')
                : t('autoclaw.startBridge', '🚀 Запустить мост')}
            </button>
            {bridge.kind === 'running' && (
              <span style={{ color: '#4cc38a' }}>
                🟢 {t('autoclaw.bridgeRunning', 'мост работает')} {bridge.info}
              </span>
            )}
            {bridge.kind === 'stopped' && (
              <span style={{ color: '#e05a5a', opacity: 0.85 }}>🔴 {bridge.error}</span>
            )}
            {(bridge.kind === 'idle' || bridge.kind === 'checking') && (
              <span style={{ opacity: 0.6 }}>{t('autoclaw.checking', 'проверка…')}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
