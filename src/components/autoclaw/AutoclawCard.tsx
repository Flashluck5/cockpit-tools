import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, EyeOff, Plug, RotateCw, Sparkles } from 'lucide-react';

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
  const [refreshing, setRefreshing] = useState(false);
  const [bridge, setBridge] = useState<BridgeState>({ kind: 'idle' });
  const [showModels, setShowModels] = useState(false);
  const [hidden, setHidden] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setStatus(await invoke<AutoclawStatus>('get_autoclaw_status'));
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
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

  const hideCard = () => {
    // soft-hide: survives until page reload only, ghost button always restores
    setHidden(true);
  };

  if (hidden) {
    return (
      <div
        className="main-card main-card-placeholder"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}
      >
        <button
          style={{
            margin: 'auto', padding: '8px 16px', cursor: 'pointer', borderRadius: 8,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
            color: 'inherit', fontSize: 13,
          }}
          onClick={() => setHidden(false)}
        >
          🦞 {t('autoclaw.showCard', 'Показать AutoClaw')}
        </button>
      </div>
    );
  }

  const expText = formatUnix(status?.token_expires_at);
  const hoursLeft = status?.token_expires_at
    ? Math.max(0, Math.round((status.token_expires_at * 1000 - Date.now()) / 3600000))
    : 0;

  return (
    <div className="main-card autoclaw-card" style={{ cursor: 'default' }}>
      <div className="main-card-header">
        <div className="header-title">
          <span style={{ fontSize: 18, lineHeight: 1 }}>🦞</span>
          <h3>
            AutoClaw
            {status?.app_version && (
              <span style={{ opacity: 0.5, fontSize: 12, fontWeight: 400, marginLeft: 6 }}>
                v{status.app_version}
              </span>
            )}
          </h3>
        </div>
        <div className="header-action-group">
          <button
            className="header-action-btn"
            onClick={() => { void refresh(); void refreshBridge(); }}
            disabled={refreshing}
            title={t('common.refresh', 'Обновить')}
          >
            <RotateCw size={14} className={refreshing ? 'loading-spinner' : ''} />
            <span>{t('common.refresh', 'Обновить')}</span>
          </button>
          <button
            className="header-action-btn header-icon-btn"
            onClick={hideCard}
            title={t('accounts.compact.hide', 'Скрыть')}
            aria-label={t('accounts.compact.hide', 'Скрыть')}
          >
            <EyeOff size={14} />
          </button>
        </div>
      </div>

      <div className="split-content">
        <div className="split-half current-half">
          <span className="half-label">
            <CheckCircle2 size={12} /> {t('autoclaw.currentAccount', 'Текущий аккаунт')}
          </span>
          {loaded && error && <div style={{ color: '#e05a5a', fontSize: 12 }}>{error}</div>}
          {loaded && !error && status && !status.installed && (
            <div style={{ opacity: 0.6, fontSize: 12 }}>
              {t('autoclaw.notInstalled', 'AutoClaw не найден')}
            </div>
          )}
          {loaded && !error && status?.installed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ fontSize: 14 }}>
                  {status.email ?? '—'}
                </strong>
                <span
                  style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                    background: status.token_valid ? 'rgba(76,195,138,0.15)' : 'rgba(224,90,90,0.15)',
                    color: status.token_valid ? '#4cc38a' : '#e05a5a',
                  }}
                >
                  {status.token_valid ? 'GATEWAY' : 'EXPIRED'}
                </span>
              </div>
              <div style={{ opacity: 0.75 }}>
                {status.token_valid ? '🟢' : '🔴'}{' '}
                {status.token_valid
                  ? t('autoclaw.tokenValidUntil', 'токен до {{exp}} (≈{{h}} ч)', { exp: expText, h: hoursLeft })
                  : t('autoclaw.tokenExpired', 'истёк — запусти AutoClaw')}
              </div>
              <div style={{ opacity: 0.75 }}>
                🧠 {status.primary_model ?? '—'}
              </div>
              <div style={{ opacity: 0.75 }}>
                {status.user_id != null && <>id {status.user_id} · </>}
                {t('autoclaw.models', 'моделей')}: {status.models.length}
              </div>
            </div>
          )}
          {!loaded && <div style={{ opacity: 0.6 }}>{t('autoclaw.loading', 'Загрузка…')}</div>}
        </div>

        <div className="split-divider" />

        <div className="split-half recommend-half">
          <span className="half-label">
            <Plug size={12} /> {t('autoclaw.bridge', 'Мост в ZCode')}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {bridge.kind === 'running' && (
              <div style={{ color: '#4cc38a' }}>
                🟢 {t('autoclaw.bridgeRunning', 'работает')}
                <div style={{ opacity: 0.7, fontSize: 11 }}>{bridge.info}</div>
              </div>
            )}
            {bridge.kind === 'stopped' && (
              <div style={{ color: '#e05a5a', fontSize: 12 }}>
                🔴 {t('autoclaw.bridgeStopped', 'не запущен')}
                <div style={{ opacity: 0.7, fontSize: 11 }}>{bridge.error}</div>
              </div>
            )}
            {(bridge.kind === 'idle' || bridge.kind === 'checking') && (
              <div style={{ opacity: 0.6 }}>{t('autoclaw.checking', 'проверка…')}</div>
            )}
            {bridge.kind === 'starting' && (
              <div style={{ opacity: 0.6 }}>{t('autoclaw.starting', 'запуск…')}</div>
            )}
            <button
              className="header-action-btn"
              style={{ padding: '4px 12px', alignSelf: 'flex-start' }}
              disabled={bridge.kind === 'starting' || bridge.kind === 'checking'}
              onClick={() => void startBridge()}
            >
              🚀 {t('autoclaw.startBridge', 'Запустить мост')}
            </button>
            <div style={{ fontSize: 11, opacity: 0.6 }}>
              {t('autoclaw.bridgeHint', 'модели AutoClaw → ZCode (127.0.0.1:8787/v1)')}
            </div>
          </div>
        </div>
      </div>

      {status?.installed && status.models.length > 0 && (
        <button className="card-footer-action" onClick={() => setShowModels((v) => !v)}>
          {showModels
            ? t('autoclaw.hideModels', 'Скрыть модели')
            : `${t('autoclaw.showModels', 'Все модели')} (${status.models.length})`}
        </button>
      )}

      {showModels && status && (
        <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.8, padding: '0 4px 10px' }}>
          {status.models.map((model) => (
            <div key={model.id}>
              <code>{model.id}</code> — {model.name} · ctx {model.context_window?.toLocaleString() ?? '—'} ·
              out {model.max_tokens?.toLocaleString() ?? '—'}
            </div>
          ))}
          <div style={{ opacity: 0.5, marginTop: 4 }}>
            <Sparkles size={10} style={{ verticalAlign: 'middle' }} />{' '}
            {status.quota_note ?? ''}
          </div>
        </div>
      )}
    </div>
  );
}
