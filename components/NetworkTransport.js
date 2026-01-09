/**
 * NetworkTransport - 网络传输层单例
 * 
 * 将 WebSocket 连接及 RPC 通信逻辑从 Main.js 解耦，使任何模块都可以直接发送消息。
 */

import { createWebSocketClient } from './WebSocketClient.js';
import { getEnv, getEnvInt } from '../utils/envHotReloader.js';
import { createLogger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

const logger = createLogger('NetworkTransport');

let _instance = null;

class NetworkTransport {
  constructor() {
    if (_instance) {
      return _instance;
    }

    this._socket = null;
    this._initialized = false;
    this._onOpenCallbacks = [];

    _instance = this;
  }

  /**
   * 初始化 WebSocket 连接
   * @param {Object} options - 可选参数，用于覆盖环境变量配置
   */
  init(options = {}) {
    if (this._initialized) {
      logger.warn('NetworkTransport 已初始化，跳过重复初始化');
      return this;
    }

    const WS_HOST = options.wsHost || getEnv('WS_HOST', 'localhost');
    const WS_PORT = options.wsPort || getEnv('WS_PORT', '6702');
    const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

    this._socket = createWebSocketClient(WS_URL, {
      reconnectIntervalMs: getEnvInt('WS_RECONNECT_INTERVAL_MS', 10000),
      maxReconnectAttempts: getEnvInt('WS_MAX_RECONNECT_ATTEMPTS', 60),
      getReconnectIntervalMs: () => getEnvInt('WS_RECONNECT_INTERVAL_MS', 10000),
      getMaxReconnectAttempts: () => getEnvInt('WS_MAX_RECONNECT_ATTEMPTS', 60)
    });

    this._socket.on('open', () => {
      for (const cb of this._onOpenCallbacks) {
        try {
          cb();
        } catch (e) {
          logger.debug('onOpen callback error', { err: String(e) });
        }
      }
    });

    logger.info(`连接到 WebSocket 服务: ${WS_URL}`);
    this._initialized = true;

    return this;
  }

  /**
   * 获取底层 socket 对象（用于事件监听等）
   */
  getSocket() {
    if (!this._initialized) {
      throw new Error('NetworkTransport 未初始化，请先调用 init()');
    }
    return this._socket;
  }

  /**
   * 注册 open 事件回调（可在 init 前注册）
   */
  onOpen(callback) {
    if (typeof callback === 'function') {
      this._onOpenCallbacks.push(callback);
    }
  }

  /**
   * 事件监听代理
   */
  on(event, handler) {
    return this._socket.on(event, handler);
  }

  /**
   * 移除事件监听代理
   */
  off(event, handler) {
    return this._socket.off(event, handler);
  }

  /**
   * 发送消息（非阻塞）
   * @param {Object|string} msg - 要发送的消息
   */
  send(msg) {
    if (!this._socket) {
      logger.warn('NetworkTransport: socket 未初始化，无法发送');
      return false;
    }
    return this._socket.send(msg);
  }

  /**
   * 发送消息并等待结果（RPC 模式）
   * @param {Object} message - 要发送的消息对象
   * @returns {Promise<Object|null>} - 返回结果或 null（超时/失败）
   */
  async sendAndWaitResult(message) {
    if (!this._socket) {
      logger.warn('NetworkTransport: socket 未初始化，无法发送');
      return null;
    }

    const maxRetriesRaw = getEnvInt('SEND_RPC_MAX_RETRIES', 0);
    const timeoutRaw = getEnvInt('SEND_RPC_TIMEOUT_MS', 120000);

    const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0
      ? maxRetriesRaw
      : 0;
    const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0
      ? timeoutRaw
      : 120000;

    const doOnce = () => {
      return new Promise((resolve) => {
        const msg = message || {};
        if (!msg.requestId) {
          try {
            msg.requestId = randomUUID();
          } catch {
            msg.requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
          }
        }
        const requestId = msg.requestId;

        let settled = false;
        let timeout;
        const handler = (data) => {
          if (settled) return;
          try {
            const payload = JSON.parse(data.toString());
            if (payload.type === 'result' && payload.requestId === requestId) {
              settled = true;
              clearTimeout(timeout);
              this._socket.off('message', handler);
              resolve(payload);
            }
          } catch (e) {}
        };

        timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          logger.warn(`请求超时: ${requestId}`);
          this._socket.off('message', handler);
          resolve(null);
        }, timeoutMs);

        this._socket.on('message', handler);
        this.send(msg);
      });
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await doOnce();
      if (result === null) {
        if (attempt < maxRetries) {
          logger.warn(`RPC请求超时，准备重试 (${attempt + 1}/${maxRetries})`);
          continue;
        }
        return null;
      }

      return result.ok ? result : null;
    }

    return null;
  }

  /**
   * 检查连接状态
   */
  isConnected() {
    return this._socket ? this._socket.isConnected() : false;
  }

  /**
   * 关闭连接
   */
  close() {
    if (this._socket) {
      this._socket.close();
    }
  }
}

// 导出单例实例
const transport = new NetworkTransport();

export { transport as NetworkTransport };
export default transport;
