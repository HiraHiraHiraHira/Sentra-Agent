import chalk from 'chalk';
import util from 'util';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

function stringifyValue(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Error) return v.message || v.name || 'Error';
  try {
    const json = JSON.stringify(v);
    // 避免过长的 JSON 串刷屏
    if (json.length > 300) return json.slice(0, 297) + '...';
    return json;
  } catch {
    return util.inspect(v, { colors: false, depth: 3, maxArrayLength: 20 });
  }
}

function formatMetaPretty(args: any[]): string {
  const parts: string[] = [];
  for (const a of args) {
    if (a === undefined || a === null) continue;
    if (a instanceof Error) {
      parts.push(`error=${stringifyValue(a)}`);
      continue;
    }
    if (typeof a === 'object' && !Array.isArray(a)) {
      for (const [k, v] of Object.entries(a)) {
        parts.push(`${k}=${stringifyValue(v)}`);
      }
      continue;
    }
    parts.push(stringifyValue(a));
  }
  return parts.join(' ');
}

function formatLogLine(args: any[]): string {
  if (!args || args.length === 0) return '';
  let message = '';
  const metaArgs: any[] = [];

  for (const a of args) {
    if (!message && typeof a === 'string') {
      message = a;
    } else {
      metaArgs.push(a);
    }
  }

  const meta = formatMetaPretty(metaArgs);
  if (message && meta) return `${message} ${meta}`;
  if (message) return message;
  return meta;
}

function localTimestamp(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
}

export function createLogger(level: LogLevel = 'info'): Logger {
  const threshold = levelWeight[level] ?? levelWeight.info;
  const jsonLog = (process.env.JSON_LOG || '').toLowerCase() === 'true';

  const write = (lvl: keyof Logger, colorTag: string, args: any[]) => {
    if (jsonLog) {
      // Try to serialize arguments conservatively
      const safe = args.map((a) => {
        try {
          return typeof a === 'string' ? a : JSON.parse(JSON.stringify(a));
        } catch {
          return typeof a === 'string' ? a : util.inspect(a, { colors: false, depth: null, maxArrayLength: 50 });
        }
      });
      const payload = { level: lvl, time: localTimestamp(), entries: safe };
      const line = JSON.stringify(payload);
      if (lvl === 'error') console.error(line);
      else if (lvl === 'warn') console.warn(line);
      else console.log(line);
      return;
    }
    const text = formatLogLine(args);
    const line = colorTag + text;
    if (lvl === 'error') console.error(line);
    else if (lvl === 'warn') console.warn(line);
    else console.log(line);
  };

  return {
    debug: (...args: any[]) => {
      if (threshold <= levelWeight.debug) {
        write('debug', chalk.gray(`[debug] ${localTimestamp()} `), args);
      }
    },
    info: (...args: any[]) => {
      if (threshold <= levelWeight.info) {
        write('info', chalk.cyan(`[info ] ${localTimestamp()} `), args);
      }
    },
    warn: (...args: any[]) => {
      if (threshold <= levelWeight.warn) {
        write('warn', chalk.yellow(`[warn ] ${localTimestamp()} `), args);
      }
    },
    error: (...args: any[]) => {
      if (threshold <= levelWeight.error) {
        write('error', chalk.red(`[error] ${localTimestamp()} `), args);
      }
    },
  };
}
