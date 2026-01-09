/**
 * CoreCommands - 核心内置指令
 * 
 * 提供基础的模型无关指令，如 /ping, /help 等。
 */

import transport from '../components/NetworkTransport.js';
import registry from '../components/CommandRegistry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CoreCommands');

/**
 * 发送简单文本回复
 */
async function sendTextReply(msg, text) {
    const isGroup = msg?.type === 'group';
    const targetId = isGroup ? msg?.group_id : msg?.sender_id;

    if (!targetId) {
        logger.warn('CoreCommands: 无法确定回复目标');
        return;
    }

    const messageParts = [{ type: 'text', data: { text } }];

    const payload = {
        type: 'sdk',
        path: isGroup ? 'send.group' : 'send.private',
        args: [Number(targetId), messageParts],
        requestId: `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    };

    await transport.sendAndWaitResult(payload);
}

// =====================
// 指令定义
// =====================

const PingCommand = {
    name: '/ping',
    description: '测试机器人是否在线',
    pattern: /^\/ping$/i,
    handler: async (msg) => {
        await sendTextReply(msg, 'pong 🏓');
    }
};

const EchoCommand = {
    name: '/echo',
    description: '回显消息内容',
    pattern: /^\/echo\s+(.+)$/i,
    handler: async (msg) => {
        const text = (msg?.text || '').trim();
        const match = text.match(/^\/echo\s+(.+)$/i);
        if (match && match[1]) {
            await sendTextReply(msg, match[1]);
        }
    }
};

const HelpCommand = {
    name: '/help',
    description: '显示可用指令列表',
    pattern: /^\/help$/i,
    handler: async (msg) => {
        const commands = registry.getCommands();
        const lines = ['📖 可用指令:'];
        for (const cmd of commands) {
            lines.push(`  ${cmd.name} - ${cmd.description || '无描述'}`);
        }
        await sendTextReply(msg, lines.join('\n'));
    }
};

const StatusCommand = {
    name: '/status',
    description: '显示机器人状态',
    pattern: /^\/status$/i,
    handler: async (msg) => {
        const connected = transport.isConnected();
        const uptimeSeconds = Math.floor(process.uptime());
        const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

        const lines = [
            '🤖 机器人状态:',
            `  连接状态: ${connected ? '✅ 已连接' : '❌ 未连接'}`,
            `  运行时间: ${Math.floor(uptimeSeconds / 60)} 分钟`,
            `  内存占用: ${memoryMB} MB`
        ];
        await sendTextReply(msg, lines.join('\n'));
    }
};

// =====================
// 注册所有核心指令
// =====================

const coreCommands = [
    PingCommand,
    EchoCommand,
    HelpCommand,
    StatusCommand
];

/**
 * 初始化核心指令
 */
export function initCoreCommands() {
    registry.registerAll(coreCommands);
    logger.info(`CoreCommands: 已注册 ${coreCommands.length} 个核心指令`);
}

export { coreCommands };
export default initCoreCommands;
