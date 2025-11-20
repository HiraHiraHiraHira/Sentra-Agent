import WebSocket from 'ws';
import { EventEmitter } from 'events';

export function createWebSocketClient(url, options = {}) {
  const reconnectIntervalMs = parseInt(options.reconnectIntervalMs ?? 10000);
  const maxReconnectAttempts = parseInt(options.maxReconnectAttempts ?? 60);

  const emitter = new EventEmitter();
  let ws = null;
  let attempts = 0;
  let closedManually = false;

  function connect() {
    if (closedManually) return;
    try {
      ws = new WebSocket(url);

      ws.on('open', () => {
        attempts = 0;
        emitter.emit('open');
      });

      ws.on('message', (data) => {
        emitter.emit('message', data);
      });

      ws.on('error', (err) => {
        emitter.emit('error', err);
      });

      ws.on('close', () => {
        emitter.emit('close');
        if (closedManually) return;
        if (attempts >= maxReconnectAttempts) {
          emitter.emit('reconnect_exhausted');
          return;
        }
        attempts += 1;
        setTimeout(connect, reconnectIntervalMs);
      });
    } catch (e) {
      emitter.emit('error', e);
      if (!closedManually) {
        if (attempts < maxReconnectAttempts) {
          attempts += 1;
          setTimeout(connect, reconnectIntervalMs);
        } else {
          emitter.emit('reconnect_exhausted');
        }
      }
    }
  }

  connect();

  function on(event, handler) {
    emitter.on(event, handler);
  }

  function off(event, handler) {
    if (emitter.off) emitter.off(event, handler);
    else emitter.removeListener(event, handler);
  }

  function send(obj) {
    try {
      const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(text);
        return true;
      }
      emitter.emit('warn', new Error('WebSocket not connected'));
      return false;
    } catch (e) {
      emitter.emit('error', e);
      return false;
    }
  }

  function isConnected() {
    return !!(ws && ws.readyState === WebSocket.OPEN);
  }

  function getRetryCount() {
    return attempts;
  }

  function getWebSocket() {
    return ws;
  }

  function close() {
    closedManually = true;
    try { ws && ws.close(); } catch {}
  }

  return { on, off, send, isConnected, getRetryCount, getWebSocket, close };
}
