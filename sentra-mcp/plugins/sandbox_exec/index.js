import WebSocket from 'ws';
import { httpRequest } from '../../src/utils/http.js';
import { ok, fail } from '../../src/utils/result.js';
import logger from '../../src/logger/index.js';
import iconv from 'iconv-lite';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureEnvTokenPrefix(token) {
  const t = String(token || '').trim();
  if (!t) return '';
  return t;
}

function normalizeTerminalType(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (['powershell', 'cmd', 'bash', 'zsh', 'sh'].includes(s)) return s;
  return '';
}

function stripAnsi(str) {
  if (!str) return '';
  return String(str).replace(/\x1b\[[0-9;]*[mGKF]/g, '').replace(/\x1b\]0;[^\x07]*\x07/g, '').replace(/\x1b[\x40-\x5F]/g, '');
}

function decodeBuffer(buf, encoding) {
  if (!buf || !Buffer.isBuffer(buf)) return String(buf || '');
  const enc = String(encoding || '').trim().toLowerCase();
  if (!enc || enc === 'utf8' || enc === 'utf-8') {
    return buf.toString('utf8');
  }
  if (enc === 'gbk' || enc === 'gb2312' || enc === 'gb18030') {
    try {
      return iconv.decode(buf, 'gbk');
    } catch {
      return buf.toString('utf8');
    }
  }
  if (enc === 'latin1' || enc === 'iso-8859-1') {
    return buf.toString('latin1');
  }
  return buf.toString('utf8');
}

function buildWsUrl(httpBase, sessionId, token, cursor = 0) {
  const base = String(httpBase || '').replace(/\/+$/, '');
  const u = new URL(`${base}/api/terminal-executor/ws/${encodeURIComponent(String(sessionId))}`);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token) u.searchParams.set('token', token);
  u.searchParams.set('cursor', String(Number(cursor || 0) || 0));
  return u.toString();
}

async function createTerminalSession({ httpBase, token, shellType, cwd }) {
  const url = String(httpBase || '').replace(/\/+$/, '') + '/api/terminal-executor/create';
  const headers = {
    'x-auth-token': token || '',
    'Content-Type': 'application/json'
  };
  const res = await httpRequest({
    method: 'POST',
    url,
    headers,
    data: {
      shellType,
      cwd: cwd || undefined,
    },
    timeoutMs: 15000,
    validateStatus: () => true,
  });
  const data = res?.data || {};
  if (!(res.status >= 200 && res.status < 300) || !data?.success || !data?.sessionId) {
    const msg = String(data?.message || data?.error || `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return String(data.sessionId);
}

async function closeTerminalSession({ httpBase, token, sessionId }) {
  const url = String(httpBase || '').replace(/\/+$/, '') + `/api/terminal-executor/close/${encodeURIComponent(String(sessionId))}`;
  const headers = {
    'x-auth-token': token || '',
    'Content-Type': 'application/json'
  };
  await httpRequest({
    method: 'POST',
    url,
    headers,
    data: {},
    timeoutMs: 15000,
    validateStatus: () => true,
  });
}

function toExecPayload(cmd, shellType) {
  const c = String(cmd || '').trim();
  if (!c) return '';
  // Use explicit line endings for PTY.
  if (shellType === 'powershell') return `${c}\r\nexit\r\n`;
  if (shellType === 'cmd') return `${c}\r\nexit\r\n`;
  // bash/zsh/sh
  return `${c}\nexit\n`;
}

function toCtrlCPayload(shellType) {
  void shellType;
  // In PTY, Ctrl+C is 0x03
  return '\u0003';
}

export default async function handler(args = {}, options = {}) {
  const cmd = String(args.cmd || '').trim();
  if (!cmd) return fail('cmd is required', 'INVALID');

  const penv = options?.pluginEnv || {};
  const httpBase = String(
    penv.SANDBOX_EXEC_CONFIG_UI_BASE_URL
    || process.env.SANDBOX_EXEC_CONFIG_UI_BASE_URL
    || 'http://127.0.0.1:7245'
  ).trim().replace(/\/+$/, '');

  const token = ensureEnvTokenPrefix(
    penv.SANDBOX_EXEC_SECURITY_TOKEN
    || process.env.SANDBOX_EXEC_SECURITY_TOKEN
    || penv.SECURITY_TOKEN
    || process.env.SECURITY_TOKEN
  );

  if (!token) {
    return fail('Missing security token for config-ui. Set SANDBOX_EXEC_SECURITY_TOKEN (or SECURITY_TOKEN) in env.', 'CONFIG', {
      detail: { httpBase },
    });
  }

  const terminalType = normalizeTerminalType(args.terminalType)
    || normalizeTerminalType(penv.SANDBOX_EXEC_TERMINAL_TYPE)
    || normalizeTerminalType(process.env.SANDBOX_EXEC_TERMINAL_TYPE)
    || (process.platform === 'win32' ? 'powershell' : 'bash');

  const cwd = String(args.cwd || '').trim();
  const closeOnFinish = args.closeOnFinish !== undefined ? !!args.closeOnFinish : true;
  const timeoutMs = Number.isFinite(Number(args.timeoutMs)) ? Math.max(1_000, Number(args.timeoutMs)) : 180_000;
  const expectExit = args.expectExit !== undefined ? !!args.expectExit : true;
  const stopSignal = String(args.stopSignal || '').trim().toLowerCase() || 'ctrl_c';

  let sessionId = '';
  let ws;
  let output = '';
  let exited = false;
  let exitCode = null;
  let signal = null;
  let timedOut = false;
  const stripAnsiEnabled = args.stripAnsi !== false;
  const encoding = String(args.encoding || 'utf8').trim().toLowerCase();
  const maxOutputChars = Number.isFinite(Number(args.maxOutputChars)) ? Math.max(0, Number(args.maxOutputChars)) : 0;
  const tailLines = Number.isFinite(Number(args.tailLines)) ? Math.max(0, Number(args.tailLines)) : 0;

  try {
    sessionId = await createTerminalSession({ httpBase, token, shellType: terminalType, cwd });

    const wsUrl = buildWsUrl(httpBase, sessionId, token, 0);

    if (typeof options?.onStream === 'function') {
      try { options.onStream({ type: 'log', stage: 'create', message: 'terminal session created', detail: { sessionId, terminalType, cwd: cwd || undefined } }); } catch { }
      try { options.onStream({ type: 'delta', delta: `[sandbox_exec] session created: ${sessionId}\n`, content: '' }); } catch { }
    }

    ws = new WebSocket(wsUrl);

    const sendInput = (data) => {
      try {
        ws.send(JSON.stringify({ type: 'input', data }));
      } catch {
      }
    };

    const startedAt = Date.now();

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (expectExit) {
          const err = new Error(`Command timeout after ${timeoutMs}ms`);
          err.code = 'TIMEOUT';
          reject(err);
          return;
        }
        // Follow-type command: return partial output on timeout.
        timedOut = true;
        resolve();
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
      };

      ws.on('open', () => {
        // send command
        const payload = expectExit ? toExecPayload(cmd, terminalType) : (terminalType === 'powershell' || terminalType === 'cmd' ? `${cmd}\r\n` : `${cmd}\n`);
        sendInput(payload);
        if (typeof options?.onStream === 'function') {
          try { options.onStream({ type: 'log', stage: 'run', message: 'command sent', detail: { cmd } }); } catch { }
        }
      });

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw || ''));
        } catch {
          return;
        }

        if (msg?.type === 'init' && msg?.data) {
          let chunk = decodeBuffer(Buffer.from(msg.data || ''), encoding);
          if (stripAnsiEnabled) chunk = stripAnsi(chunk);
          if (chunk) {
            output += chunk;
            if (typeof options?.onStream === 'function') {
              try { options.onStream({ type: 'delta', delta: chunk, content: output }); } catch { }
            }
          }
          return;
        }

        if (msg?.type === 'data') {
          let chunk = decodeBuffer(Buffer.from(msg.data || ''), encoding);
          if (stripAnsiEnabled) chunk = stripAnsi(chunk);
          if (chunk) {
            output += chunk;
            if (typeof options?.onStream === 'function') {
              try { options.onStream({ type: 'delta', delta: chunk, content: output }); } catch { }
            }
          }
          return;
        }

        if (msg?.type === 'exit') {
          exited = true;
          exitCode = (typeof msg.exitCode === 'number') ? msg.exitCode : null;
          signal = (typeof msg.signal === 'number') ? msg.signal : null;
          cleanup();
          resolve();
          return;
        }

        if (msg?.type === 'error') {
          cleanup();
          reject(new Error(String(msg.message || 'terminal ws error')));
        }
      });

      ws.on('error', (e) => {
        cleanup();
        reject(e);
      });

      ws.on('close', () => {
        // If closed without exit, let timeout decide.
        const elapsed = Date.now() - startedAt;
        if (exited) return;
        if (elapsed > 1500) return;
      });
    });

    if (!expectExit && !exited) {
      // Best-effort stop follow-type command.
      if (stopSignal === 'ctrl_c') {
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data: toCtrlCPayload(terminalType) }));
          }
        } catch {
        }
      }
    }

    if (typeof options?.onStream === 'function') {
      try { options.onStream({ type: 'log', stage: 'exit', message: 'command finished', detail: { exitCode, signal } }); } catch { }
      try { options.onStream({ type: 'delta', delta: `\n[sandbox_exec] exit: ${exitCode ?? ''}${signal != null ? ` signal=${signal}` : ''}\n`, content: output }); } catch { }
    }

    let finalOutput = output;
    if (tailLines > 0) {
      const lines = finalOutput.split(/\r?\n/);
      if (lines.length > tailLines) {
        finalOutput = lines.slice(-tailLines).join('\n');
      }
    }
    if (maxOutputChars > 0 && finalOutput.length > maxOutputChars) {
      finalOutput = finalOutput.slice(-maxOutputChars);
    }

    return ok({
      sessionId,
      terminalType,
      cwd: cwd || undefined,
      cmd,
      exited,
      exitCode,
      signal,
      timedOut,
      output: finalOutput,
    });
  } catch (e) {
    logger.warn?.('sandbox_exec:failed', { label: 'PLUGIN', error: String(e?.message || e), sessionId, terminalType });
    const code = String(e?.code || '').toUpperCase() === 'TIMEOUT' ? 'TIMEOUT' : 'ERR';
    return fail(e, code, {
      detail: { sessionId: sessionId || undefined, terminalType, httpBase },
    });
  } finally {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    } catch {
    }

    if (closeOnFinish && sessionId) {
      try {
        await sleep(50);
        await closeTerminalSession({ httpBase, token, sessionId });
      } catch {
      }
    }
  }
}
