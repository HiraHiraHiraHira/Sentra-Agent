import { create } from 'zustand';
import type { TerminalWin } from '../types/ui';
import { storage } from '../utils/storage';
import { cleanupTerminalSnapshots } from '../utils/terminalSnapshotDb';

type SetTerminalWindows = (next: TerminalWin[] | ((prev: TerminalWin[]) => TerminalWin[])) => void;

type TerminalStore = {
  terminalWindows: TerminalWin[];
  activeTerminalId: string | null;
  setTerminalWindows: SetTerminalWindows;
  setActiveTerminalId: (id: string | null) => void;
};

let cleaned = false;
function ensureLegacyCleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    storage.remove('sentra_terminal_windows');
    storage.remove('sentra_active_terminal_id');
  } catch {
    // ignore
  }
}

const TERMINAL_WINDOWS_KEY = 'sentra_terminal_windows_v2';
const ACTIVE_TERMINAL_ID_KEY = 'sentra_active_terminal_id_v2';
 const TERMINAL_BOOT_KEY = 'sentra_terminal_boot_v2';

const TERMINAL_SNAPSHOT_TTL_MS = 1000 * 60 * 60 * 24;

const TERMINAL_SYNC_CHANNEL = 'sentra_terminal_sync_v1';

let persistTimer: number | null = null;
let persisted = false;
let synced = false;
let bcSynced = false;
let bc: BroadcastChannel | null = null;
const bcId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let lastSnapshotCleanupAt = 0;

function schedulePersist() {
  if (persistTimer != null) return;
  // Batch multiple state changes within the same frame (drag/move/resize) without a fixed delay.
  persistTimer = window.requestAnimationFrame(() => {
    persistTimer = null;
    flushPersist();
  });
}

function flushPersist() {
  if (persistTimer != null) {
    window.cancelAnimationFrame(persistTimer);
    persistTimer = null;
  }
  const st = useTerminalStore.getState();

  const keepIds = new Set<string>(st.terminalWindows.map(w => String(w.processId || '')).filter(Boolean));

  storage.setJson(TERMINAL_WINDOWS_KEY, st.terminalWindows, 'session');
  storage.setString(ACTIVE_TERMINAL_ID_KEY, st.activeTerminalId || '', 'session');

  const okWindows = storage.setJson(TERMINAL_WINDOWS_KEY, st.terminalWindows, 'local');
  const okActive = storage.setString(ACTIVE_TERMINAL_ID_KEY, st.activeTerminalId || '', 'local');

  if (!okWindows || !okActive) {
    try { cleanupLocalTerminalArtifacts(keepIds); } catch { }
    storage.setJson(TERMINAL_WINDOWS_KEY, st.terminalWindows, 'local');
    storage.setString(ACTIVE_TERMINAL_ID_KEY, st.activeTerminalId || '', 'local');
  }

  broadcastTerminalState(st.terminalWindows, st.activeTerminalId);
  maybeCleanupSnapshots(st.terminalWindows);
}

function ensurePersistenceHooks() {
  if (persisted) return;
  persisted = true;
  const onVis = () => {
    if (document.visibilityState === 'hidden') flushPersist();
  };
  window.addEventListener('pagehide', flushPersist);
  window.addEventListener('beforeunload', flushPersist);
  window.addEventListener('unload', flushPersist);
  document.addEventListener('visibilitychange', onVis);
}

function ensureCrossTabSyncHooks() {
  if (synced) return;
  synced = true;

  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.storageArea !== localStorage) return;
    if (e.key !== TERMINAL_WINDOWS_KEY && e.key !== ACTIVE_TERMINAL_ID_KEY) return;

    try {
      const raw = storage.getJson<any>(TERMINAL_WINDOWS_KEY, { backend: 'local', fallback: [] });
      const nextWindows = normalizePersistedTerminals(raw);
      const savedActiveLocal = storage.getString(ACTIVE_TERMINAL_ID_KEY, { backend: 'local', fallback: '' });
      const nextActive = savedActiveLocal ? savedActiveLocal : null;

      applySyncedState(nextWindows, nextActive);
    } catch {
      // ignore
    }
  });
}

function applySyncedState(nextWindows: TerminalWin[], nextActive: string | null) {
  useTerminalStore.setState(prev => {
    const prevActive = prev.activeTerminalId;
    const sameActive = prevActive === nextActive;

    const prevWins = prev.terminalWindows;
    const sameWins =
      prevWins.length === nextWindows.length &&
      prevWins.every((w, idx) => {
        const n = nextWindows[idx];
        return (
          w.id === n.id &&
          w.processId === n.processId &&
          w.appKey === n.appKey &&
          w.title === n.title &&
          w.z === n.z &&
          w.minimized === n.minimized &&
          w.maximized === n.maximized &&
          w.pos?.x === n.pos?.x &&
          w.pos?.y === n.pos?.y &&
          w.size?.width === n.size?.width &&
          w.size?.height === n.size?.height
        );
      });

    if (sameActive && sameWins) return prev;
    return {
      ...prev,
      terminalWindows: sameWins ? prev.terminalWindows : nextWindows,
      activeTerminalId: sameActive ? prev.activeTerminalId : nextActive,
    };
  });
}

function ensureBroadcastSyncHooks() {
  if (bcSynced) return;
  bcSynced = true;
  if (typeof BroadcastChannel === 'undefined') return;

  try {
    bc = new BroadcastChannel(TERMINAL_SYNC_CHANNEL);
  } catch {
    bc = null;
    return;
  }

  try {
    bc.onmessage = (ev: MessageEvent) => {
      const msg: any = ev?.data;
      if (!msg || msg.source === bcId) return;
      if (msg.type !== 'terminal_state') return;

      const raw = Array.isArray(msg.windows) ? msg.windows : [];
      const nextWindows = normalizePersistedTerminals(raw);
      const nextActive = typeof msg.active === 'string' && msg.active ? msg.active : null;
      applySyncedState(nextWindows, nextActive);
    };
  } catch {
    // ignore
  }
}

function broadcastTerminalState(windows: TerminalWin[], active: string | null) {
  if (!bc) return;
  try {
    bc.postMessage({
      type: 'terminal_state',
      source: bcId,
      windows,
      active,
      ts: Date.now(),
    });
  } catch {
    // ignore
  }
}

function maybeCleanupSnapshots(wins: TerminalWin[]) {
  const now = Date.now();
  if (now - lastSnapshotCleanupAt < 60_000) return;
  lastSnapshotCleanupAt = now;

  const keepKeys = new Set<string>();
  for (const w of wins) {
    const id = String(w?.processId || '');
    if (!id) continue;
    const kind = String(w?.appKey || '').startsWith('execpty:') ? 'exec' : 'script';
    keepKeys.add(`${kind}:${id}`);
  }
  void cleanupTerminalSnapshots({ ttlMs: TERMINAL_SNAPSHOT_TTL_MS, keepKeys });
}

function centerPos() {
  return {
    x: Math.max(0, window.innerWidth / 2 - 350),
    y: Math.max(40, window.innerHeight / 2 - 250),
  };
}

function normalizePersistedTerminals(raw: any): TerminalWin[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const c = centerPos();
  return raw
    .filter((t: any) => t && typeof t.processId === 'string' && typeof t.appKey === 'string')
    .map((t: any) => {
      const p = t?.pos || { x: 0, y: 0 };
      const invalid =
        p.x == null || p.y == null ||
        p.x < 0 || p.y < 30 ||
        p.x > window.innerWidth - 120 || p.y > window.innerHeight - 120;
      const pos = invalid ? c : { x: Number(p.x), y: Number(p.y) };
      const z = Number.isFinite(Number(t.z)) ? Number(t.z) : 1001;
      const minimized = !!t.minimized;
      const maximized = !!t.maximized;
      const size = t?.size && Number.isFinite(Number(t.size.width)) && Number.isFinite(Number(t.size.height))
        ? { width: Number(t.size.width), height: Number(t.size.height) }
        : undefined;
      return {
        ...t,
        pos,
        z,
        minimized,
        maximized,
        size,
      } as TerminalWin;
    });
}

function cleanupLocalTerminalArtifacts(keepProcessIds: Set<string>) {
  const now = Date.now();
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    return;
  }

  const prefixes = [
    'sentra_terminal_snapshot:',
    'sentra_terminal_cursor:',
    'sentra_terminal_persist_ts:',
    'sentra_exec_terminal_snapshot:',
    'sentra_exec_terminal_cursor:',
    'sentra_exec_terminal_persist_ts:',
  ];

  for (const k of keys) {
    const prefix = prefixes.find(p => k.startsWith(p));
    if (!prefix) continue;

    const id = k.slice(prefix.length);
    if (keepProcessIds.has(id)) continue;

    if (k.startsWith('sentra_terminal_persist_ts:') || k.startsWith('sentra_exec_terminal_persist_ts:')) {
      const ts = storage.getNumber(k, { backend: 'local', fallback: 0 });
      if (ts > 0 && now - ts <= TERMINAL_SNAPSHOT_TTL_MS) continue;
    }

    try { localStorage.removeItem(k); } catch { }
  }
}

export const useTerminalStore = create<TerminalStore>((set) => {
  ensureLegacyCleanup();
  ensurePersistenceHooks();

  const boot = storage.getString(TERMINAL_BOOT_KEY, { backend: 'local', fallback: '' });
  const isColdStart = !boot;
  if (isColdStart) {
    try { storage.setString(TERMINAL_BOOT_KEY, String(Date.now()), 'local'); } catch { }
  }

  const persistedWindowsLocal = storage.getJson<any>(TERMINAL_WINDOWS_KEY, { backend: 'local', fallback: [] });
  const persistedWindowsSession = storage.getJson<any>(TERMINAL_WINDOWS_KEY, { backend: 'session', fallback: [] });
  if ((!Array.isArray(persistedWindowsLocal) || persistedWindowsLocal.length === 0) && Array.isArray(persistedWindowsSession) && persistedWindowsSession.length > 0) {
    try { storage.setJson(TERMINAL_WINDOWS_KEY, persistedWindowsSession, 'local'); } catch { }
  }
  const persistedWindows = (Array.isArray(persistedWindowsLocal) && persistedWindowsLocal.length)
    ? persistedWindowsLocal
    : (Array.isArray(persistedWindowsSession) ? persistedWindowsSession : []);
  const terminalWindows = normalizePersistedTerminals(persistedWindows);

  const savedActiveLocal = storage.getString(ACTIVE_TERMINAL_ID_KEY, { backend: 'local', fallback: '' });
  const savedActiveSession = storage.getString(ACTIVE_TERMINAL_ID_KEY, { backend: 'session', fallback: '' });
  if (!savedActiveLocal && savedActiveSession) {
    try { storage.setString(ACTIVE_TERMINAL_ID_KEY, savedActiveSession, 'local'); } catch { }
  }
  const savedActive = savedActiveLocal || savedActiveSession;
  const activeTerminalId = savedActive ? savedActive : null;

  const setTerminalWindows: SetTerminalWindows = (next) => {
    set(prev => ({
      ...prev,
      terminalWindows: typeof next === 'function' ? (next as any)(prev.terminalWindows) : next,
    }));
    schedulePersist();
  };

  return {
    terminalWindows,
    activeTerminalId,
    setTerminalWindows,
    setActiveTerminalId: (id: string | null) => {
      set({ activeTerminalId: id });
      schedulePersist();
    },
  };
});

ensureCrossTabSyncHooks();
ensureBroadcastSyncHooks();
