import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function toPosix(p) {
  try { return String(p || '').replace(/\\/g, '/'); } catch { return String(p || ''); }
}

export function toFileUrl(p) {
  try { return pathToFileURL(p).href; } catch { return null; }
}

export function abs(p) {
  if (!p || typeof p !== 'string') return process.cwd();
  return path.resolve(process.cwd(), p);
}

export function relToCwd(p) {
  try { return toPosix(path.relative(process.cwd(), p)); } catch { return null; }
}

export function toAbsoluteLocalPath(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (/^file:/i.test(raw)) {
    try {
      return fileURLToPath(raw);
    } catch {
      return null;
    }
  }

  if (/^https?:/i.test(raw)) return null;
  if (/^data:/i.test(raw)) return null;

  try {
    const p = path.resolve(raw);
    if (!path.isAbsolute(p)) return null;
    return p;
  } catch {
    return null;
  }
}
