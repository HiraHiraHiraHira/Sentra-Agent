/**
 * MessageService - 统一消息发送服务
 * 
 * 作为唯一的"发信局"，封装消息发送和历史记录逻辑。
 * 所有发送操作（包括 LLM 回复、指令回复）都应通过此服务。
 */

import transport from './NetworkTransport.js';
import { createLogger } from '../utils/logger.js';
import { getEnv } from '../utils/envHotReloader.js';

const logger = createLogger('MessageService');

let _historyManager = null;

class MessageService {
    constructor() {
        this._initialized = false;
    }

    /**
     * 初始化服务
     * @param {Object} options
     * @param {Object} options.historyManager - GroupHistoryManager 实例
     */
    init(options = {}) {
        if (options.historyManager) {
            _historyManager = options.historyManager;
        }
        this._initialized = true;
        logger.info('MessageService 初始化完成');
        return this;
    }

    /**
     * 检查发送者是否为管理员
     * @param {string} senderId
     * @returns {boolean}
     */
    isAdmin(senderId) {
        const whitelist = getEnv('CROSS_CHAT_SEND_ALLOW_SENDER_IDS', '');
        if (!whitelist || whitelist.trim() === '') {
            // 白名单为空时，默认允许所有人（保持向后兼容）
            return true;
        }
        const allowed = whitelist.split(',').map(id => id.trim()).filter(Boolean);
        return allowed.includes(String(senderId));
    }

    /**
     * 发送纯文本消息
     * @param {Object} msg - 原始消息对象（用于确定回复目标）
     * @param {string} text - 要发送的文本内容
     * @param {Object} options
     * @param {boolean} options.recordHistory - 是否记录到历史 (默认 true)
     * @param {string} options.source - 来源标识 (例如 'command', 'llm')
     * @returns {Promise<Object|null>} 发送结果
     */
    async sendText(msg, text, options = {}) {
        const { recordHistory = true, source = 'unknown' } = options;

        const isGroup = msg?.type === 'group';
        const targetId = isGroup ? msg?.group_id : msg?.sender_id;

        if (!targetId) {
            logger.warn('MessageService.sendText: 无法确定回复目标');
            return null;
        }

        const messageParts = [{ type: 'text', data: { text } }];

        const payload = {
            type: 'sdk',
            path: isGroup ? 'send.group' : 'send.private',
            args: [Number(targetId), messageParts],
            requestId: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        };

        logger.debug(`MessageService.sendText: 发送到 ${isGroup ? '群' : '私聊'} ${targetId}, source=${source}`);

        const result = await transport.sendAndWaitResult(payload);

        // 记录到历史
        if (recordHistory && _historyManager && result?.ok) {
            try {
                const groupId = isGroup ? `G:${msg.group_id}` : `U:${msg.sender_id}`;
                // 对于指令回复，我们简化处理：直接追加到 conversations
                // 注意：这不走完整的 pair 流程，因为指令不需要那么复杂
                const history = await _historyManager._getOrInitHistory(groupId);
                if (history && Array.isArray(history.conversations)) {
                    history.conversations.push({
                        role: 'assistant',
                        content: text,
                        pairId: `cmd-${Date.now()}`,
                        timestamp: Date.now(),
                        source
                    });
                    logger.debug(`MessageService: 已记录到历史 (groupId=${groupId}, source=${source})`);
                }
            } catch (e) {
                logger.debug('MessageService: 记录历史失败', { err: String(e) });
            }
        }

        return result;
    }

    /**
     * 发送带引用回复的消息
     * @param {Object} msg - 原始消息对象
     * @param {string} text - 要发送的文本内容
     * @param {string|number} replyToMsgId - 要引用的消息 ID
     * @param {Object} options
     * @returns {Promise<Object|null>} 发送结果
     */
    async sendReply(msg, text, replyToMsgId, options = {}) {
        const { recordHistory = true, source = 'unknown' } = options;

        const isGroup = msg?.type === 'group';
        const targetId = isGroup ? msg?.group_id : msg?.sender_id;

        if (!targetId) {
            logger.warn('MessageService.sendReply: 无法确定回复目标');
            return null;
        }

        const messageParts = [
            { type: 'reply', data: { id: String(replyToMsgId) } },
            { type: 'text', data: { text } }
        ];

        const payload = {
            type: 'sdk',
            path: isGroup ? 'send.group' : 'send.private',
            args: [Number(targetId), messageParts],
            requestId: `reply-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        };

        logger.debug(`MessageService.sendReply: 引用回复 ${replyToMsgId}`);

        const result = await transport.sendAndWaitResult(payload);

        // 记录到历史
        if (recordHistory && _historyManager && result?.ok) {
            try {
                const groupId = isGroup ? `G:${msg.group_id}` : `U:${msg.sender_id}`;
                const history = await _historyManager._getOrInitHistory(groupId);
                if (history && Array.isArray(history.conversations)) {
                    history.conversations.push({
                        role: 'assistant',
                        content: text,
                        pairId: `reply-${Date.now()}`,
                        timestamp: Date.now(),
                        source
                    });
                }
            } catch (e) {
                logger.debug('MessageService: 记录历史失败', { err: String(e) });
            }
        }

        return result;
    }

    /**
     * 检查连接状态
     */
    isConnected() {
        return transport.isConnected();
    }
}

// 单例导出
const messageService = new MessageService();

export { messageService as MessageService };
export default messageService;
