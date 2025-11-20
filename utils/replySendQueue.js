/**
 * 回复发送队列管理器
 * 确保回复按顺序发送，避免多个任务同时完成时消息交错
 */

import { createLogger } from './logger.js';

const logger = createLogger('ReplySendQueue');

class ReplySendQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.sendDelayMs = parseInt(process.env.REPLY_SEND_DELAY_MS || '2000'); // 默认2秒
    logger.info(`回复发送队列初始化 - 发送间隔: ${this.sendDelayMs}ms`);
  }

  /**
   * 添加发送任务到队列
   * @param {Function} sendTask - 发送任务函数（返回 Promise）
   * @param {string} taskId - 任务标识（用于日志）
   * @returns {Promise} 发送结果
   */
  async enqueue(sendTask, taskId = 'unknown') {
    return new Promise((resolve, reject) => {
      this.queue.push({ sendTask, taskId, resolve, reject });
      logger.debug(`任务入队: ${taskId} (队列长度: ${this.queue.length})`);
      
      // 如果当前没有在处理，立即开始处理
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * 处理队列中的任务
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const { sendTask, taskId, resolve, reject } = this.queue.shift();
      logger.info(`开始发送: ${taskId} (剩余队列: ${this.queue.length})`);

      try {
        const startTime = Date.now();
        const result = await sendTask();
        const duration = Date.now() - startTime;
        
        logger.success(`发送完成: ${taskId} (耗时: ${duration}ms)`);
        resolve(result);

        // 如果队列中还有任务，等待一段时间再发送下一个
        if (this.queue.length > 0) {
          logger.debug(`等待 ${this.sendDelayMs}ms 后发送下一条...`);
          await new Promise(r => setTimeout(r, this.sendDelayMs));
        }
      } catch (error) {
        logger.error(`发送失败: ${taskId}`, error);
        reject(error);
      }
    }

    this.isProcessing = false;
    logger.debug('队列处理完毕');
  }

  /**
   * 获取队列长度
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * 清空队列
   */
  clear() {
    const count = this.queue.length;
    this.queue = [];
    logger.warn(`清空队列: ${count} 个任务被取消`);
    return count;
  }
}

// 导出单例
export const replySendQueue = new ReplySendQueue();
