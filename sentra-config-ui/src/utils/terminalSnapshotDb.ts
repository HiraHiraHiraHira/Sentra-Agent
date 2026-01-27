export type TerminalSnapshotKind = 'script' | 'exec';

export type TerminalSnapshotRecord = {
  id: string;
  kind: TerminalSnapshotKind;
  ts: number;
  cursor: number;
  snapshot: string;
};

const DB_NAME = 'sentra_terminal_snapshots_v1';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function makeKey(kind: TerminalSnapshotKind, id: string) {
  return `${kind}:${String(id || '')}`;
}

function withTx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, mode);
      const st = tx.objectStore(STORE_NAME);
      const req = fn(st);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function getTerminalSnapshot(kind: TerminalSnapshotKind, id: string): Promise<TerminalSnapshotRecord | null> {
  const key = makeKey(kind, id);
  try {
    const db = await openDb();
    try {
      const raw = await withTx<any>(db, 'readonly', (st) => st.get(key));
      if (!raw) return null;
      const rec: TerminalSnapshotRecord = {
        id: String(raw.id || ''),
        kind: raw.kind === 'exec' ? 'exec' : 'script',
        ts: Number(raw.ts || 0),
        cursor: Number(raw.cursor || 0),
        snapshot: typeof raw.snapshot === 'string' ? raw.snapshot : '',
      };
      return rec;
    } finally {
      try { db.close(); } catch { }
    }
  } catch {
    return null;
  }
}

export async function setTerminalSnapshot(rec: TerminalSnapshotRecord): Promise<boolean> {
  const key = makeKey(rec.kind, rec.id);
  try {
    const db = await openDb();
    try {
      await withTx(db, 'readwrite', (st) => st.put({
        key,
        id: String(rec.id || ''),
        kind: rec.kind,
        ts: Number(rec.ts || 0),
        cursor: Number.isFinite(Number(rec.cursor)) ? Number(rec.cursor) : 0,
        snapshot: String(rec.snapshot || ''),
      }));
      return true;
    } finally {
      try { db.close(); } catch { }
    }
  } catch {
    return false;
  }
}

export async function removeTerminalSnapshot(kind: TerminalSnapshotKind, id: string): Promise<boolean> {
  const key = makeKey(kind, id);
  try {
    const db = await openDb();
    try {
      await withTx(db, 'readwrite', (st) => st.delete(key));
      return true;
    } finally {
      try { db.close(); } catch { }
    }
  } catch {
    return false;
  }
}

export async function cleanupTerminalSnapshots(opts: { ttlMs: number; keepKeys?: Set<string> }): Promise<void> {
  const ttlMs = Number.isFinite(Number(opts.ttlMs)) ? Number(opts.ttlMs) : 0;
  const keep = opts.keepKeys || new Set<string>();
  if (ttlMs <= 0) return;

  const now = Date.now();

  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const st = tx.objectStore(STORE_NAME);
          const req = st.openCursor();
          tx.oncomplete = () => resolve();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
              return;
            }
            const v: any = cursor.value;
            const key = String(v?.key || '');
            const ts = Number(v?.ts || 0);
            if (key && !keep.has(key) && (ts <= 0 || now - ts > ttlMs)) {
              try { cursor.delete(); } catch { }
            }
            try { cursor.continue(); } catch { }
          };
          tx.onabort = () => reject(tx.error);
        } catch (e) {
          reject(e);
        }
      });
    } finally {
      try { db.close(); } catch { }
    }
  } catch {
    return;
  }
}
