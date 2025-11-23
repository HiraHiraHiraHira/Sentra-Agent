import { loadConfig, type AdapterConfig } from './config';

export type { AdapterConfig };

export type ConfigListener = (prev: AdapterConfig, next: AdapterConfig) => void;

let currentConfig: AdapterConfig = loadConfig();
const listeners = new Set<ConfigListener>();

export function getConfig(): AdapterConfig {
  return currentConfig;
}

export function refreshConfigFromEnv(): AdapterConfig {
  const prev = currentConfig;
  const next = loadConfig();
  currentConfig = next;
  if (prev !== next) {
    for (const fn of Array.from(listeners)) {
      try {
        fn(prev, next);
      } catch {
        // ignore listener errors
      }
    }
  }
  return next;
}

export function onConfigChange(listener: ConfigListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
