/**
 * ackPhraseGenerator.js - 拟人化回执短语生成器
 * 
 * 根据 Agent 人设生成符合风格的"收到/正在办"短句库。
 * 在系统启动或人设变更时调用一次 LLM，后续直接从缓存抽取。
 */

import { createLogger } from './logger.js';
import { getEnvInt, getEnvBool } from './envHotReloader.js';

const logger = createLogger('AckPhraseGenerator');

/**
 * 构建生成回执短语的 Prompt
 * @param {Object} presetJson - Agent 人设 JSON
 * @returns {string} Prompt 文本
 */
function buildAckPrompt(presetJson, count = 20) {
    // 兼容多种人设结构：优先从 parameters 提取，回退到 meta
    const meta = presetJson?.meta || {};
    const params = presetJson?.parameters || {};

    // 名字：parameters.name > meta.name > meta.nickname > meta.node_name
    const name = params.name || meta.name || meta.nickname || meta.node_name || 'Bot';

    // 性格：parameters.personality.temperament > parameters.personality.summary > meta.personality
    const personality = params.personality?.temperament
        || params.personality?.summary
        || meta.personality
        || '';

    // 说话风格：parameters.personality.behavior_guidelines > meta.speaking_style
    const speakingStyle = params.personality?.behavior_guidelines
        || meta.speaking_style
        || '';

    // 语气
    const tone = meta.tone || '';

    const traits = [personality, speakingStyle, tone].filter(Boolean).join('；');
    const traitDesc = traits ? `\n性格特点：${traits.slice(0, 300)}` : '';

    return `你是一个名叫"${name}"的角色。${traitDesc}

请生成 ${count} 句符合你人设风格的**任务回执短句**。这些短句用于：当用户发来一条需要处理的消息时，你会先发一句简短的回执表示"收到了/正在处理"，然后再进行深度思考和回复。

要求：
1. 每句话必须很短（5-15个字），口语化
2. 必须符合你的性格和说话风格（${personality ? personality.slice(0, 50) : '自然'}）
3. 内容可以是"好的""收到""稍等"之类的意思，但要有个性
4. 可以包含符合人设的语气词、表情符号
5. 不能重复，每句要有变化
6. 不要编号，直接按 JSON 数组格式输出

输出格式（严格遵守）：
["短句1", "短句2", "短句3", ...]

开始生成：`;
}

/**
 * 从 LLM 响应中解析短语数组
 * @param {string} response - LLM 原始响应
 * @returns {string[]} 短语数组
 */
function parsePhrasesFromResponse(response) {
    if (!response || typeof response !== 'string') {
        return [];
    }

    let clean = response.trim();

    // 1. 去除 Markdown 代码块标记
    clean = clean.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');

    // 2. 关键优化：统一将中文引号/弯引号转换为标准 ASCII 引号
    clean = clean
        .replace(/[""]/g, '"')   // 中文双引号 -> "
        .replace(/['']/g, "'");  // 中文单引号 -> '

    // 3. 尝试提取最外层的 []
    const match = clean.match(/\[[\s\S]*\]/);
    const contentToParse = match ? match[0] : clean;

    // 内部帮助函数：校验并返回数组
    const validateArray = (arr) => {
        if (Array.isArray(arr)) {
            return arr
                .filter(p => typeof p === 'string' && p.trim())
                .map(p => p.trim());
        }
        return null;
    };

    // 4. 尝试标准 JSON 解析
    try {
        const parsed = JSON.parse(contentToParse);
        const valid = validateArray(parsed);
        if (valid && valid.length > 0) return valid;
    } catch { }

    // 5. 尝试作为 JS 对象字面量解析 (兼容单引号)
    try {
        if (contentToParse.startsWith('[') && contentToParse.endsWith(']')) {
            const parsed = new Function('return ' + contentToParse)();
            const valid = validateArray(parsed);
            if (valid && valid.length > 0) return valid;
        }
    } catch { }

    // 6. 策略C: 正则提取（稳健处理单行拼接 "A", "B", "C"）
    // 匹配双引号或单引号包裹的内容，支持转义字符
    const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    const matches = [];
    let m;
    while ((m = regex.exec(contentToParse)) !== null) {
        // m[1] 是双引号内容，m[2] 是单引号内容
        const val = m[1] !== undefined ? m[1] : m[2];
        if (val && val.trim().length >= 2) {
            matches.push(val.trim());
        }
    }
    if (matches.length > 1) { // 至少匹配到两个才认为是有效列表，避免匹配到偶尔出现的单个引用词
        return [...new Set(matches)].slice(0, 30);
    }

    // 7. 回退：按行分割并清洗
    const lines = response.split('\n')
        .map(line => {
            // 针对行首尾的清洗也要考虑刚才的引号标准化
            return line
                .replace(/[""]/g, '"').replace(/['']/g, "'") // 局部也做一次标准化
                .replace(/^[\[\d\.\-\*\s"']+/g, '')
                .replace(/[,"'\]\s]+$/g, '')
                .trim();
        })
        .filter(line => line.length >= 2 && line.length <= 40);

    return [...new Set(lines)].slice(0, 30);
}

/**
 * 生成回执短语库
 * @param {Object} agent - Agent 实例（用于调用 LLM）
 * @param {Object} presetJson - Agent 人设 JSON
 * @returns {Promise<string[]>} 短语数组
 */
export async function generateAckPhrases(agent, presetJson) {
    const enabled = getEnvBool('ACK_ENABLED', true);
    if (!enabled) {
        logger.info('回执短语生成已禁用 (ACK_ENABLED=false)');
        return [];
    }

    const count = getEnvInt('ACK_PHRASE_COUNT', 20);

    if (!agent || typeof agent.chat !== 'function') {
        logger.warn('回执短语生成失败：agent 未就绪');
        return getDefaultPhrases();
    }

    if (!presetJson || typeof presetJson !== 'object') {
        logger.warn('回执短语生成失败：人设 JSON 为空，使用默认短语');
        return getDefaultPhrases();
    }

    try {
        const prompt = buildAckPrompt(presetJson, count);
        const result = await agent.chat([
            { role: 'user', content: prompt }
        ], {
            temperature: 0.9,
            maxTokens: 800
        });

        const responseText = typeof result === 'string'
            ? result
            : (result?.choices?.[0]?.message?.content || result?.response || '');

        const phrases = parsePhrasesFromResponse(responseText);

        if (phrases.length === 0) {
            logger.warn('回执短语解析失败，使用默认短语');
            return getDefaultPhrases();
        }

        logger.info(`回执短语生成成功，共 ${phrases.length} 条`);
        return phrases;

    } catch (e) {
        logger.warn('回执短语生成异常，使用默认短语', { err: String(e) });
        return getDefaultPhrases();
    }
}

/**
 * 默认短语（当 LLM 不可用时降级使用）
 */
function getDefaultPhrases() {
    return [
        '收到~',
        '好的',
        '稍等哦',
        '马上处理',
        '了解',
        'OK',
        '收到，处理中...',
        '好嘞',
        '知道啦',
        '这就去办'
    ];
}

/**
 * 从短语库中随机抽取（带近期去重）
 */
export class AckPhraseSelector {
    constructor(phrases = [], dedupeSize = 5) {
        this._phrases = phrases;
        this._recentUsed = [];
        this._dedupeSize = dedupeSize;
    }

    /**
     * 更新短语库
     */
    setPhrases(phrases) {
        this._phrases = Array.isArray(phrases) ? phrases : [];
        this._recentUsed = [];
    }

    /**
     * 随机抽取一句（避免与最近 N 句重复）
     * @returns {string|null}
     */
    getRandomPhrase() {
        if (!this._phrases || this._phrases.length === 0) {
            return null;
        }

        // 过滤掉最近用过的
        const candidates = this._phrases.filter(p => !this._recentUsed.includes(p));

        // 如果全部用过，清空历史重来
        if (candidates.length === 0) {
            this._recentUsed = [];
            return this._phrases[Math.floor(Math.random() * this._phrases.length)];
        }

        // 随机选一句
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];

        // 记录到最近使用
        this._recentUsed.push(chosen);
        if (this._recentUsed.length > this._dedupeSize) {
            this._recentUsed.shift();
        }

        return chosen;
    }

    /**
     * 获取当前短语库大小
     */
    get size() {
        return this._phrases.length;
    }
}

export default { generateAckPhrases, AckPhraseSelector };
