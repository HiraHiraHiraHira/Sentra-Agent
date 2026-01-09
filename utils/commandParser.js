/**
 * 命令参数解析工具
 * 
 * 使用 minimist 解析命令行风格的参数
 * 支持：--key=value, --flag, -f 等格式
 */

import minimist from 'minimist';
import { createLogger } from './logger.js';

const logger = createLogger('CommandParser');

/**
 * 解析命令文本为结构化参数
 * @param {string} text - 完整的命令文本（如 "/config --set model=gpt4 --verbose"）
 * @returns {Object} 解析后的参数对象
 * 
 * @example
 * parseCommand("/config --set model=gpt4 --verbose")
 * // 返回: { _: ['config'], set: 'model=gpt4', verbose: true }
 * 
 * @example
 * parseCommand("/echo hello world")
 * // 返回: { _: ['echo', 'hello', 'world'] }
 */
export function parseCommand(text) {
    if (!text || typeof text !== 'string') {
        return { _: [] };
    }

    // 移除开头的斜杠
    const normalized = text.trim().startsWith('/')
        ? text.trim().slice(1)
        : text.trim();

    // 按空白分割（保留引号内的空格）
    const args = tokenize(normalized);

    // 使用 minimist 解析
    const parsed = minimist(args);

    logger.debug('命令解析结果', { input: text.slice(0, 50), parsed });

    return parsed;
}

/**
 * 分词器：按空白分割，但保留引号内的内容
 * @param {string} input 
 * @returns {string[]}
 */
function tokenize(input) {
    const tokens = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true;
            quoteChar = char;
        } else if (char === quoteChar && inQuote) {
            inQuote = false;
            quoteChar = '';
        } else if (char === ' ' && !inQuote) {
            if (current) {
                tokens.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current) {
        tokens.push(current);
    }

    return tokens;
}

/**
 * 从参数对象中提取键值对
 * 用于处理 --set key=value 格式
 * @param {string} kvString - 如 "model=gpt4"
 * @returns {{ key: string, value: string } | null}
 */
export function parseKeyValue(kvString) {
    if (!kvString || typeof kvString !== 'string') {
        return null;
    }

    const idx = kvString.indexOf('=');
    if (idx === -1) {
        return { key: kvString, value: '' };
    }

    return {
        key: kvString.slice(0, idx),
        value: kvString.slice(idx + 1)
    };
}

/**
 * 检查是否存在某个标志
 * @param {Object} parsed - minimist 解析结果
 * @param {string} flag - 标志名（如 'verbose', 'v'）
 * @returns {boolean}
 */
export function hasFlag(parsed, ...flags) {
    for (const flag of flags) {
        if (parsed[flag] === true) {
            return true;
        }
    }
    return false;
}

/**
 * 获取参数值（支持别名）
 * @param {Object} parsed - minimist 解析结果
 * @param {...string} keys - 参数名（如 'model', 'm'）
 * @returns {string | undefined}
 */
export function getArg(parsed, ...keys) {
    for (const key of keys) {
        if (parsed[key] !== undefined && parsed[key] !== true && parsed[key] !== false) {
            return String(parsed[key]);
        }
    }
    return undefined;
}

export default {
    parseCommand,
    parseKeyValue,
    hasFlag,
    getArg
};
