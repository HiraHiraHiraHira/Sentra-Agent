/**
 * AckService.js - 拟人化回执服务
 * 
 * 管理回执短语缓存，提供即时发送能力。
 * 单例模式，在系统启动时初始化，消息到达时调用。
 */

import { generateAckPhrases, AckPhraseSelector } from '../utils/ackPhraseGenerator.js';
import { smartSend } from '../utils/sendUtils.js';
import { createLogger } from '../utils/logger.js';
import { getEnvBool, getEnvInt } from '../utils/envHotReloader.js';

const logger = createLogger('AckService');

class AckService {
    constructor() {
        this._selector = new AckPhraseSelector([], 5);
        this._enabled = false;
        this._initialized = false;

        // 冷却控制：同一会话在冷却期内不重复发回执
        this._cooldownMap = new Map(); // conversationId -> lastAckAt
    }

    /**
     * 初始化回执服务
     * @param {Object} agent - Agent 实例
     * @param {Object} presetJson - 人设 JSON
     */
    async init(agent, presetJson) {
        const enabled = getEnvBool('ACK_ENABLED', true);
        if (!enabled) {
            this._enabled = false;
            this._initialized = true;
            logger.info('回执服务已禁用 (ACK_ENABLED=false)');
            return;
        }

        try {
            const phrases = await generateAckPhrases(agent, presetJson);
            this._selector.setPhrases(phrases);
            this._enabled = phrases.length > 0;
            this._initialized = true;

            if (this._enabled) {
                logger.info(`回执服务初始化成功，共 ${phrases.length} 条短语`);
            } else {
                logger.warn('回执服务初始化完成，但短语库为空');
            }
        } catch (e) {
            this._enabled = false;
            this._initialized = true;
            logger.warn('回执服务初始化失败', { err: String(e) });
        }
    }

    /**
     * 刷新短语库（人设变更时调用）
     * @param {Object} agent - Agent 实例
     * @param {Object} presetJson - 人设 JSON
     */
    async refresh(agent, presetJson) {
        logger.info('回执服务正在刷新短语库...');
        await this.init(agent, presetJson);
    }

    /**
     * 获取会话标识
     * @private
     */
    _getConversationId(msg) {
        const senderId = String(msg?.sender_id ?? '');
        if (msg?.group_id) {
            return `G:${msg.group_id}:${senderId}`;
        }
        return `U:${senderId}`;
    }

    /**
     * 检查是否在冷却期内
     * @private
     */
    _isInCooldown(conversationId) {
        const cooldownMs = getEnvInt('ACK_COOLDOWN_MS', 10000);
        if (cooldownMs <= 0) return false;

        const lastAckAt = this._cooldownMap.get(conversationId);
        if (!lastAckAt) return false;

        return (Date.now() - lastAckAt) < cooldownMs;
    }

    /**
     * 记录回执发送时间
     * @private
     */
    _markAckSent(conversationId) {
        this._cooldownMap.set(conversationId, Date.now());

        // 清理过期条目（超过 1 小时的）
        const now = Date.now();
        for (const [key, ts] of this._cooldownMap.entries()) {
            if (now - ts > 3600000) {
                this._cooldownMap.delete(key);
            }
        }
    }

    /**
     * 发送回执（如果启用且不在冷却期）
     * @param {Object} msg - 消息对象
     * @returns {Promise<boolean>} 是否成功发送
     */
    async sendAckIfEnabled(msg) {
        // 检查启用状态
        if (!this._enabled || !this._initialized) {
            return false;
        }

        // 检查运行时开关
        const runtimeEnabled = getEnvBool('ACK_ENABLED', true);
        if (!runtimeEnabled) {
            return false;
        }

        // 检查冷却
        const conversationId = this._getConversationId(msg);
        if (this._isInCooldown(conversationId)) {
            logger.debug(`回执跳过：会话 ${conversationId} 在冷却期内`);
            return false;
        }

        // 抽取短语
        const phrase = this._selector.getRandomPhrase();
        if (!phrase) {
            return false;
        }

        try {
            // 构造简单的 sentra-response
            const response = this._buildSimpleResponse(phrase, msg);

            // 发送（不引用原消息，避免显得机械）
            await smartSend(msg, response, false);

            // 记录冷却
            this._markAckSent(conversationId);

            logger.debug(`回执已发送: "${phrase}" -> ${conversationId}`);
            return true;

        } catch (e) {
            logger.warn('回执发送失败', { err: String(e) });
            return false;
        }
    }

    /**
     * 构造简单的 sentra-response
     * @private
     */
    _buildSimpleResponse(text, msg) {
        const targetTag = msg?.type === 'private'
            ? `<user_id>${msg.sender_id}</user_id>`
            : (msg?.group_id ? `<group_id>${msg.group_id}</group_id>` : '');

        return `<sentra-response>
${targetTag}
<text1>${text}</text1>
</sentra-response>`;
    }

    /**
     * 获取服务状态
     */
    getStatus() {
        return {
            enabled: this._enabled,
            initialized: this._initialized,
            phraseCount: this._selector.size,
            cooldownEntries: this._cooldownMap.size
        };
    }

    /**
     * 是否已启用
     */
    get isEnabled() {
        return this._enabled && this._initialized;
    }
}

// 导出单例
const ackService = new AckService();
export default ackService;
