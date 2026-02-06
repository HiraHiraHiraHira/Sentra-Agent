import { useEffect } from 'react';

export function useQqUiHeartbeat(opts: {
  authHeaders: Record<string, string>;
  scope?: string;
  intervalMs?: number;
}) {
  const { authHeaders, scope = 'qq_sandbox', intervalMs = 15_000 } = opts;

  useEffect(() => {
    const beat = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        void fetch('/api/system/ui/heartbeat', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ scope, ts: Date.now() }),
        }).catch(() => { });
      } catch {
      }
    };

    beat();
    const t = window.setInterval(beat, intervalMs);

    const onVis = () => {
      if (document.visibilityState !== 'hidden') beat();
    };
    const onFocus = () => beat();
    try {
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVis);
    } catch {
    }

    return () => {
      try { window.clearInterval(t); } catch { }
      try {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVis);
      } catch {
      }
    };
  }, [authHeaders, intervalMs, scope]);
}
