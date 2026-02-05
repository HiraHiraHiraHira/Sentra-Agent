import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { fileURLToPath } from 'url';

export interface CacheLoggerLike {
  debug?: (...args: any[]) => void;
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
}

const DEFAULT_IMAGE_EXPIRE_DAYS = 2;
const DEFAULT_FILE_EXPIRE_DAYS = 2;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function toInt(v: string | undefined, def: number): number {
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export function getImageCacheDir(): string {
  return process.env.IMAGE_CACHE_DIR || path.resolve(process.cwd(), 'cache', 'images');
}

export function getFileCacheDir(): string {
  return process.env.FILE_CACHE_DIR || path.resolve(process.cwd(), 'cache', 'file');
}

export function getImageCacheTtlMs(): number | null {
  const days = toInt(process.env.IMAGE_CACHE_EXPIRE_DAYS, DEFAULT_IMAGE_EXPIRE_DAYS);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days * 24 * 60 * 60 * 1000;
}

export function getFileCacheTtlMs(): number | null {
  const days = toInt(process.env.FILE_CACHE_EXPIRE_DAYS, DEFAULT_FILE_EXPIRE_DAYS);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days * 24 * 60 * 60 * 1000;
}

export function isLocalPath(p: string | undefined | null): boolean {
  const s = normalizeLocalPath(p);
  if (!s) return false;
  if (/^[a-zA-Z]:[\\\/]/.test(s)) return true;
  if (s.startsWith('\\\\')) return true;
  if (s.startsWith('/')) return true;
  return false;
}

function normalizeLocalPath(input: string | undefined | null): string {
  const s0 = String(input || '').trim();
  if (!s0) return '';

  if (/^file:\/\//i.test(s0)) {
    try {
      const u = new URL(s0);
      if (u.protocol === 'file:') {
        return fileURLToPath(u);
      }
    } catch {
    }
  }

  // Tolerate Windows file URLs that were partially stripped to /C:/...
  if (s0.startsWith('/') && /^[a-zA-Z]:[\\\/]/.test(s0.slice(1))) {
    return s0.slice(1);
  }

  return s0;
}

function tryResolveFromCache(kind: CacheKind, fileRelLike: string): string | undefined {
  try {
    const dir = kind === 'image' ? getImageCacheDir() : getFileCacheDir();
    if (!dir) return undefined;

    const rel = String(fileRelLike || '').trim();
    if (!rel) return undefined;

    // Treat as relative to cache dir (supports nested rel paths)
    const candidate = path.resolve(dir, rel);
    const relToDir = path.relative(dir, candidate);
    if (relToDir.startsWith('..') || path.isAbsolute(relToDir)) return undefined;
    if (fs.existsSync(candidate)) return candidate;
  } catch {
  }
  return undefined;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch {
  }
}

function pickFilename(hint?: string, urlStr?: string, fallbackPrefix = 'file'): string {
  let base = hint && hint.trim();
  if (!base && urlStr) {
    try {
      const u = new URL(urlStr);
      const p = u.pathname.split('/').filter(Boolean).pop();
      if (p) base = decodeURIComponent(p);
    } catch {
      const parts = urlStr.split('?')[0].split('/');
      const p = parts.filter(Boolean).pop();
      if (p) base = p;
    }
  }
  if (!base) {
    base = `${fallbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  base = base.replace(/[\\\/:*?"<>|]/g, '_');
  return base;
}

function chooseHttpModule(urlStr: string): typeof http | typeof https {
  if (/^https:/i.test(urlStr)) return https;
  return http;
}

export type CacheKind = 'image' | 'file' | 'video' | 'record';

export interface EnsureLocalFileOptions {
  kind: CacheKind;
  file?: string;
  url?: string;
  filenameHint?: string;
}

export async function downloadToCache(urlStr: string, kind: CacheKind, filenameHint?: string): Promise<string> {
  const dir = kind === 'image' ? getImageCacheDir() : getFileCacheDir();
  await ensureDir(dir);
  const filename = pickFilename(filenameHint, urlStr, kind);
  const destPath = path.resolve(dir, filename);

  if (fs.existsSync(destPath)) {
    return destPath;
  }

  const httpModule = chooseHttpModule(urlStr);

  await new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    const doRequest = (targetUrl: string, redirected?: boolean) => {
      const req = httpModule.get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && !redirected) {
          const nextUrl = res.headers.location;
          doRequest(nextUrl, true);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(() => resolve()));
      });
      req.on('error', reject);
    };

    doRequest(urlStr);
  });

  return destPath;
}

export async function ensureLocalFile(opts: EnsureLocalFileOptions): Promise<string | undefined> {
  const { kind, file, url, filenameHint } = opts;

  const fileNorm = file ? normalizeLocalPath(file) : '';

  if (fileNorm && isLocalPath(fileNorm) && fs.existsSync(fileNorm)) {
    return fileNorm;
  }

  // Some OneBot/NapCat fields provide only a filename; resolve it to our cache dir.
  if (fileNorm && !isLocalPath(fileNorm)) {
    const fromCache = tryResolveFromCache(kind, fileNorm);
    if (fromCache) return fromCache;
  }

  const finalUrl = url && /^https?:\/\//i.test(url) ? url : undefined;
  if (finalUrl) {
    try {
      const p = await downloadToCache(finalUrl, kind, filenameHint || file);
      return p;
    } catch {
      return undefined;
    }
  }

  return fileNorm && isLocalPath(fileNorm) ? fileNorm : undefined;
}

async function cleanupCacheDir(dir: string, ttlMs: number, logger?: CacheLoggerLike): Promise<void> {
  try {
    const now = Date.now();
    await ensureDir(dir);
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const tasks: Promise<void>[] = [];

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        tasks.push(cleanupCacheDir(full, ttlMs, logger));
        continue;
      }
      if (!entry.isFile()) continue;
      tasks.push((async () => {
        try {
          const stat = await fsp.stat(full);
          const age = now - stat.mtimeMs;
          if (age > ttlMs) {
            await fsp.unlink(full);
          }
        } catch {
        }
      })());
    }

    await Promise.all(tasks);
  } catch (err) {
    if (logger && logger.debug) {
      logger.debug({ err, dir }, 'cache cleanup failed');
    }
  }
}

export async function cleanupCacheOnce(logger?: CacheLoggerLike): Promise<void> {
  const imageTtl = getImageCacheTtlMs();
  const fileTtl = getFileCacheTtlMs();
  const tasks: Promise<void>[] = [];
  if (imageTtl && imageTtl > 0) {
    tasks.push(cleanupCacheDir(getImageCacheDir(), imageTtl, logger));
  }
  if (fileTtl && fileTtl > 0) {
    tasks.push(cleanupCacheDir(getFileCacheDir(), fileTtl, logger));
  }
  if (tasks.length) {
    await Promise.all(tasks);
  }
}

let cleanupTimerStarted = false;

export function startCacheCleanupTimer(logger?: CacheLoggerLike): void {
  if (cleanupTimerStarted) return;
  cleanupTimerStarted = true;

  const run = () => {
    cleanupCacheOnce(logger).catch(() => {
    });
  };

  run();

  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  if (typeof (timer as any).unref === 'function') {
    (timer as any).unref();
  }
}
