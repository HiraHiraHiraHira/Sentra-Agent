/**
 * CommandRegistry - 指令注册表
 * 
 * 管理模型无关的指令/插件，在消息到达 LLM 管道之前进行拦截。
 * 
 * 增强功能：
 * - 统一权限校验
 * - 通过 MessageService 发送回复（自动记录历史）
 */

import { createLogger } from '../utils/logger.js';
import { getEnvBool } from '../utils/envHotReloader.js';
import messageService from './MessageService.js';

const logger = createLogger('CommandRegistry');

class CommandRegistry {
    constructor() {
        this._commands = [];
    }

    /**
     * 注册一个指令
     * @param {Object} command - 指令配置
     * @param {RegExp|Function} command.pattern - 匹配模式（正则或函数）
     * @param {Function} command.handler - 处理函数 (msg, context) => Promise<{text?: string} | void>
     * @param {string} [command.name] - 指令名称（用于日志）
     * @param {string} [command.description] - 指令描述
     * @param {string} [command.permission] - 权限要求 ('admin' | undefined)
     */
    register(command) {
        if (!command || (!command.pattern && typeof command.match !== 'function')) {
            logger.warn('CommandRegistry: 注册指令失败，缺少 pattern 或 match');
            return;
        }
        if (typeof command.handler !== 'function') {
            logger.warn('CommandRegistry: 注册指令失败，缺少 handler');
            return;
        }

        this._commands.push({
            pattern: command.pattern,
            match: command.match,
            handler: command.handler,
            name: command.name || '(unnamed)',
            description: command.description || '',
            permission: command.permission || null
        });

        logger.debug(`CommandRegistry: 已注册指令 "${command.name || '(unnamed)'}""`);
    }

    /**
     * 批量注册指令
     * @param {Array} commands - 指令数组
     */
    registerAll(commands) {
        if (!Array.isArray(commands)) return;
        for (const cmd of commands) {
            this.register(cmd);
        }
    }

    /**
     * 尝试处理消息
     * @param {Object} msg - 消息对象
     * @param {Object} context - 上下文
     * @returns {Promise<boolean>} - 是否已处理
     */
    async handle(msg, context = {}) {
        // 检查指令系统是否启用
        if (!getEnvBool('COMMANDS_ENABLED', true)) {
            return false;
        }

        const text = (msg?.text || msg?.summary || '').trim();
        if (!text) return false;

        for (const cmd of this._commands) {
            let matched = false;

            // 支持正则匹配
            if (cmd.pattern instanceof RegExp) {
                matched = cmd.pattern.test(text);
            }
            // 支持自定义匹配函数
            else if (typeof cmd.match === 'function') {
                try {
                    matched = await cmd.match(msg, text, context);
                } catch (e) {
                    logger.debug(`CommandRegistry: match 函数异常`, { name: cmd.name, err: String(e) });
                }
            }

            if (matched) {
                // === 权限校验 ===
                if (cmd.permission === 'admin') {
                    const senderId = String(msg?.sender_id || '');
                    if (!messageService.isAdmin(senderId)) {
                        logger.info(`Command denied: ${cmd.name} (sender=${senderId} 无权限)`);
                        // 静默拒绝（不回复），但返回 true 阻止流向 LLM
                        return true;
                    }
                }

                logger.info(`Command handled: ${cmd.name} (text="${text.slice(0, 50)}")`);

                try {
                    // 执行 handler，获取返回值
                    const result = await cmd.handler(msg, context);

                    // === 统一发送 ===
                    // 如果 handler 返回了 { text: '...' }，则通过 MessageService 发送
                    if (result && typeof result.text === 'string') {
                        await messageService.sendText(msg, result.text, {
                            recordHistory: result.recordHistory !== false,
                            source: `command:${cmd.name}`
                        });
                    }

                    return true;
                } catch (e) {
                    logger.warn(`CommandRegistry: 指令 "${cmd.name}" 执行异常`, { err: String(e) });
                    // 出错时不阻断后续流程，返回 false 让消息继续流向 LLM
                    return false;
                }
            }
        }

        return false;
    }

    /**
     * 获取所有已注册的指令（用于帮助命令等）
     */
    getCommands() {
        return this._commands.map(c => ({
            name: c.name,
            description: c.description,
            permission: c.permission
        }));
    }

    /**
     * 清空所有指令
     */
    clear() {
        this._commands = [];
    }
}

// 导出单例
const registry = new CommandRegistry();

export { registry as CommandRegistry };
export default registry;
