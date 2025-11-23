import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { refreshConfigFromEnv } from './runtimeConfig';

let started = false;

export function startEnvWatcher(customPath?: string): void {
  if (started) return;
  started = true;

  const envPath = customPath || path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  let timer: NodeJS.Timeout | undefined;

  const handleChange = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        dotenv.config({ path: envPath, override: true });
        const cfg = refreshConfigFromEnv();
        try {
          console.log('[envWatcher] .env reloaded, connectMode=%s, streamPort=%d', cfg.connectMode, cfg.streamPort);
        } catch {}
      } catch {
        // ignore reload errors
      }
    }, 300);
  };

  try {
    fs.watch(envPath, { persistent: false }, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        handleChange();
      }
    });
  } catch {
    // ignore watcher errors
  }
}
