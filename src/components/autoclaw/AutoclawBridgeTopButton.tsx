import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface BridgeHealth {
  ok: boolean;
  brokerPort: number | null;
}

type State =
  | { kind: 'unknown' }
  | { kind: 'running'; port: number | null }
  | { kind: 'stopped' }
  | { kind: 'busy'; label: string };

/**
 * Compact top-bar button: shows AutoClaw bridge state, launches it on click.
 */
export default function AutoclawBridgeTopButton() {
  const [state, setState] = useState<State>({ kind: 'unknown' });

  const probe = useCallback(async () => {
    try {
      const value = await invoke<BridgeHealth>('autoclaw_bridge_status');
      setState({ kind: 'running', port: value?.brokerPort ?? null });
    } catch {
      setState({ kind: 'stopped' });
    }
  }, []);

  useEffect(() => {
    void probe();
    const timer = window.setInterval(() => void probe(), 30000);
    return () => window.clearInterval(timer);
  }, [probe]);

  const onClick = useCallback(async () => {
    if (state.kind === 'running') {
      // already up — re-probe to refresh
      await probe();
      return;
    }
    setState({ kind: 'busy', label: '…' });
    try {
      await invoke<string>('autoclaw_bridge_start');
      const value = await invoke<BridgeHealth>('autoclaw_bridge_status');
      setState({ kind: 'running', port: value?.brokerPort ?? null });
    } catch {
      setState({ kind: 'stopped' });
    }
  }, [state, probe]);

  const dot =
    state.kind === 'running' ? '🟢' : state.kind === 'stopped' ? '🔴' : '⚪';

  const title =
    state.kind === 'running'
      ? `AutoClaw мост работает${state.port ? ` (broker :${state.port})` : ''} — нажми для обновления`
      : state.kind === 'stopped'
        ? 'AutoClaw мост не запущен — нажми, чтобы запустить'
        : 'AutoClaw мост';

  return (
    <button
      className="header-action-btn"
      onClick={() => void onClick()}
      disabled={state.kind === 'busy'}
      title={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <span style={{ fontSize: 12, lineHeight: 1 }}>{dot}</span>
      <span>AutoClaw</span>
    </button>
  );
}
