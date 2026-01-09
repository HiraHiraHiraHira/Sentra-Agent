/**
 * CoreCommands - 核心内置指令
 * 
 * 提供基础的模型无关指令，如 /ping, /help 等。
 * 
 * 增强版：Handler 返回结果对象，由 CommandRegistry 统一发送。
 */

import registry from '../components/CommandRegistry.js';
import messageService from '../components/MessageService.js';
import { parseCommand, parseKeyValue, hasFlag, getArg } from '../utils/commandParser.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CoreCommands');

// =====================
// 指令定义
// =====================

const PingCommand = {
    name: '/ping',
    description: '测试机器人是否在线',
    pattern: /^\/ping$/i,
    permission: 'admin', // 仅管理员可用
    handler: async (msg) => {
        return { text: 'pong 🏓' };
    }
};

const EchoCommand = {
    name: '/echo',
    description: '回显消息内容',
    pattern: /^\/echo\s+(.+)$/i,
    permission: 'admin',
    handler: async (msg) => {
        const text = (msg?.text || '').trim();
        const match = text.match(/^\/echo\s+(.+)$/i);
        if (match && match[1]) {
            return { text: match[1] };
        }
        return null;
    }
};

const HelpCommand = {
    name: '/help',
    description: '显示可用指令列表',
    pattern: /^\/help$/i,
    permission: 'admin',
    handler: async (msg) => {
        const commands = registry.getCommands();
        const lines = ['📖 可用指令:'];
        for (const cmd of commands) {
            const adminTag = cmd.permission === 'admin' ? ' [管理员]' : '';
            lines.push(`  ${cmd.name}${adminTag} - ${cmd.description || '无描述'}`);
        }
        return { text: lines.join('\n') };
    }
};

const StatusCommand = {
    name: '/status',
    description: '显示机器人状态',
    pattern: /^\/status$/i,
    permission: 'admin',
    handler: async (msg) => {
        const connected = messageService.isConnected();
        const uptimeSeconds = Math.floor(process.uptime());
        const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

        const lines = [
            '🤖 机器人状态:',
            `  连接状态: ${connected ? '✅ 已连接' : '❌ 未连接'}`,
            `  运行时间: ${Math.floor(uptimeSeconds / 60)} 分钟`,
            `  内存占用: ${memoryMB} MB`
        ];
        return { text: lines.join('\n') };
    }
};

/**
 * /config 指令 - 演示高级参数解析
 * 用法: /config --list
 *       /config --get <key>
 *       /config --set <key>=<value>
 *       /config -v (详细模式)
 */
const ConfigCommand = {
    name: '/config',
    description: '查看/修改配置 (示例: /config --list)',
    pattern: /^\/config\b/i,
    permission: 'admin',
    handler: async (msg) => {
        const text = (msg?.text || '').trim();
        const args = parseCommand(text);

        // 检查标志
        const verbose = hasFlag(args, 'v', 'verbose');

        if (args.list || args.l) {
            // /config --list
            const info = [
                '⚙️ 配置信息:',
                `  Node.js: ${process.version}`,
                `  平台: ${process.platform}`,
                `  架构: ${process.arch}`
            ];
            if (verbose) {
                info.push(`  PID: ${process.pid}`);
                info.push(`  工作目录: ${process.cwd()}`);
            }
            return { text: info.join('\n') };
        }

        const getKey = getArg(args, 'get', 'g');
        if (getKey) {
            // /config --get <key>
            const envValue = process.env[getKey];
            if (envValue !== undefined) {
                return { text: `🔧 ${getKey} = ${envValue}` };
            } else {
                return { text: `❌ 配置项 "${getKey}" 不存在` };
            }
        }

        const setArg = getArg(args, 'set', 's');
        if (setArg) {
            // /config --set <key>=<value>
            const kv = parseKeyValue(setArg);
            if (kv && kv.key) {
                // 注意：这里只是演示，实际不会修改 process.env
                return { text: `✅ 已设置 ${kv.key} = ${kv.value} (演示模式，未实际生效)` };
            }
        }

        // 默认显示帮助
        return {
            text: [
                '⚙️ /config 用法:',
                '  /config --list     显示系统配置',
                '  /config --get KEY  获取环境变量',
                '  /config --set K=V  设置配置 (演示)',
                '  /config -v         详细模式'
            ].join('\n')
        };
    }
};

// =====================
// 注册所有核心指令
// =====================

const coreCommands = [
    PingCommand,
    EchoCommand,
    HelpCommand,
    StatusCommand,
    ConfigCommand
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
