import { textSegmentation } from '../src/segmentation.js';
import { tokenCounter } from '../src/token-counter.js';
import emojiRegex from 'emoji-regex';
import natural from 'natural';
import LinkifyIt from 'linkify-it';
import { getEnv, getEnvBool } from '../utils/envHotReloader.js';

function getDefaultModel() {
  return getEnv('REPLY_DECISION_MODEL', getEnv('MAIN_AI_MODEL', 'gpt-4.1-mini'));
}
const linkify = new LinkifyIt();
const EMOJI_REGEX = emojiRegex();
const WORD_CHAR_REGEX = /[\p{L}\p{N}]/u;
const PUNCT_OR_SYMBOL_REGEX = /[\p{P}\p{S}]/gu;

function clamp01(x) {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function isReplyGateEnabled() {
  return getEnvBool('REPLY_GATE_ENABLED', true);
}

const DEFAULT_REPLY_GATE_MODEL_CONFIG = {
  version: 1,
  contentWeights: {
    bias: -0.5,
    punctuationOnly: -1.2,
    mentionByAt: 1.8,
    mentionByName: 1.2,
    tokenInIdealRange: 1.0,
    tokenTooLong: -1.0,
    tokenShortMeaningful: 0.6,
    segmentCountHigh: 0.7,
    averageSegmentLengthGood: 0.5,
    lexicalDiversityLow: -0.9,
    lexicalDiversityHigh: 0.4,
    uniqueCharRatioLow: -0.8,
    highPunctuationRatio: -0.8,
    veryShortLowInfo: -0.7,
    emojiOnly: -1.2,
    emojiRatioHigh: -0.8,
    emojiRatioMedium: -0.5,
    highUrlRatio: -0.8,
    mediumUrlRatio: -0.6,
    recentSenderDuplicate: -0.7,
    recentSenderNearDuplicate: -0.5,
    followup: 0.8
  },
  budgetWeights: {
    bias: 1.0,
    senderFatigue: -2.0,
    groupFatigue: -1.6,
    senderReplyRate: -1.4,
    groupReplyRate: -1.0
  },
  thresholds: {
    lowProbability: 0.25,
    highProbability: 0.6
  }
};

let cachedReplyGateModelConfig = null;
let cachedReplyGateModelConfigEnv = null;

function mergeModelConfig(base, override) {
  if (!override || typeof override !== 'object') return base;
  const result = { ...base };
  if (override.contentWeights && typeof override.contentWeights === 'object') {
    result.contentWeights = { ...base.contentWeights, ...override.contentWeights };
  }
  if (override.budgetWeights && typeof override.budgetWeights === 'object') {
    result.budgetWeights = { ...base.budgetWeights, ...override.budgetWeights };
  }
  if (override.thresholds && typeof override.thresholds === 'object') {
    result.thresholds = { ...base.thresholds, ...override.thresholds };
  }
  if (typeof override.version === 'number') {
    result.version = override.version;
  }
  return result;
}

function getReplyGateModelConfig() {
  const raw = getEnv('REPLY_GATE_MODEL_CONFIG_JSON', '').trim();
  if (!raw) {
    if (!cachedReplyGateModelConfig) {
      cachedReplyGateModelConfig = { ...DEFAULT_REPLY_GATE_MODEL_CONFIG };
      cachedReplyGateModelConfigEnv = '';
    }
    return cachedReplyGateModelConfig;
  }
  if (cachedReplyGateModelConfig && cachedReplyGateModelConfigEnv === raw) {
    return cachedReplyGateModelConfig;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedReplyGateModelConfig = mergeModelConfig(DEFAULT_REPLY_GATE_MODEL_CONFIG, parsed || {});
    cachedReplyGateModelConfigEnv = raw;
  } catch {
    cachedReplyGateModelConfig = { ...DEFAULT_REPLY_GATE_MODEL_CONFIG };
    cachedReplyGateModelConfigEnv = raw;
  }
  return cachedReplyGateModelConfig;
}

function applyLinearModel(features, weights) {
  if (!weights || typeof weights !== 'object') return 0;
  if (!features || typeof features !== 'object') return 0;
  let sum = 0;
  for (const [name, weight] of Object.entries(weights)) {
    if (!Number.isFinite(weight) || weight === 0) continue;
    const v = features[name];
    if (!Number.isFinite(v)) continue;
    sum += v * weight;
  }
  return sum;
}

function sigmoid(x) {
  if (!Number.isFinite(x)) return 0.5;
  if (x > 20) return 1;
  if (x < -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

function computeTextSimilarity(a, b) {
  const s1 = (a || '').trim();
  const s2 = (b || '').trim();
  if (!s1 || !s2) return 0;
  try {
    const sim = natural.JaroWinklerDistance(s1.toLowerCase(), s2.toLowerCase());
    if (typeof sim === 'number' && Number.isFinite(sim)) {
      return sim;
    }
    return 0;
  } catch {
    return 0;
  }
}

function computeInterestScore(rawText, signals = {}, context = {}) {
  const text = (rawText || '').trim();
  if (!text) {
    return { score: 0, details: { reason: 'empty_text' } };
  }

  let score = 0;
  const details = {};
  const decisionContext = context.decisionContext || null;
  const compactText = text.replace(/\s+/g, '');
  const hasWordLikeChars = WORD_CHAR_REGEX.test(text);
  const emojiMatches = EMOJI_REGEX ? text.match(EMOJI_REGEX) || [] : [];
  const emojiCount = emojiMatches.length;
  const textWithoutEmoji = EMOJI_REGEX ? text.replace(EMOJI_REGEX, '').trim() : text.trim();
  const punctuationOnly = compactText.length > 0
    && compactText.replace(PUNCT_OR_SYMBOL_REGEX, '').length === 0
    && !hasWordLikeChars
    && emojiCount === 0;

   const contentFeatures = {
    bias: 1
  };
  const budgetFeatures = {
    bias: 1
  };

  if (punctuationOnly && !signals.isFollowupAfterBotReply) {
    contentFeatures.punctuationOnly = 1;
    details.punctuationOnly = 1;
  }

  // 基础统计：分词 & token
  let segStats = null;
  let tokenStats = null;
  try {
    segStats = textSegmentation.getSegmentationStats(text, { useSegmentation: true });
  } catch {
    segStats = null;
  }

  try {
    tokenStats = tokenCounter.getTextStats(text, getDefaultModel());
  } catch {
    tokenStats = { tokenCount: 0, charCount: text.length, wordCount: 0 };
  }

  const tokenCount = tokenStats.tokenCount || 0;
  const charCount = tokenStats.charCount || text.length;

  // 1) 提及信号（显式 @ / 名称提及）
  if (signals.mentionedByAt) {
    contentFeatures.mentionByAt = 1;
    details.mentionByAt = 1;
  }
  if (!signals.mentionedByAt && signals.mentionedByName) {
    contentFeatures.mentionByName = 1;
    details.mentionByName = 1;
  }

  // 2) 文本长度 & token 数
  if (tokenCount >= 8 && tokenCount <= 256) {
    contentFeatures.tokenInIdealRange = 1;
    details.tokenRange = 1;
  } else if (tokenCount > 512) {
    contentFeatures.tokenTooLong = 1;
    details.tooLong = 1;
  } else if (tokenCount >= 3 && tokenCount < 8 && hasWordLikeChars) {
    contentFeatures.tokenShortMeaningful = 1;
    details.shortButMeaningful = 1;
  }

  // 3) 内容丰富度（基于分词统计）
  if (segStats) {
    const { segmentCount, averageSegmentLength, primaryLanguage } = segStats;
    if (segmentCount > 5) {
      contentFeatures.segmentCountHigh = 1;
      details.segmentCount = 1;
    }
    if (averageSegmentLength > 2 && averageSegmentLength < 20) {
      contentFeatures.averageSegmentLengthGood = 1;
      details.avgSegmentLen = 1;
    }
    const segments = Array.isArray(segStats.segments) ? segStats.segments : [];
    if (segments.length > 0) {
      const normalizedTokens = segments.map((t) => String(t).trim()).filter(Boolean);
      const totalTokens = normalizedTokens.length;
      if (totalTokens > 0) {
        const uniqueTokens = new Set(normalizedTokens);
        const lexicalDiversity = uniqueTokens.size / totalTokens;
        details.lexicalDiversity = Number(lexicalDiversity.toFixed(3));
        if (totalTokens >= 5) {
          if (lexicalDiversity < 0.3) {
            contentFeatures.lexicalDiversityLow = 1;
            details.lowLexicalDiversity = 1;
          } else if (lexicalDiversity > 0.7 && totalTokens >= 8) {
            contentFeatures.lexicalDiversityHigh = 1;
            details.highLexicalDiversity = 1;
          }
        }
      }
    }
    // 单一字符重复占比很高，通常是笑声/拉长音等低信息内容
    const uniqueChars = new Set(text.split(''));
    const uniqueRatio = uniqueChars.size / Math.max(1, charCount);
    if (uniqueRatio < 0.4 && charCount >= 4) {
      contentFeatures.uniqueCharRatioLow = 1;
      details.lowUniqueCharRatio = 1;
    }
    // 标点占比很高时，通常不是需要复杂回复的消息
    if (segStats.languageBlocks && Array.isArray(segStats.languageBlocks)) {
      const punctuationLen = segStats.languageBlocks
        .filter((b) => b.language === 'punctuation')
        .reduce((sum, b) => sum + (b.text?.length || 0), 0);
      const punctRatio = punctuationLen / Math.max(1, charCount);
      details.punctuationRatio = Number.isFinite(punctRatio) ? Number(punctRatio.toFixed(3)) : 0;
      if (punctRatio > 0.6 && tokenCount < 16) {
        contentFeatures.highPunctuationRatio = 1;
        details.highPunctuationRatio = 1;
      }
    }
    // 只有极少分词且没有任何文字信息时，才认为是低价值
    if (segmentCount <= 3 && charCount <= 8 && !hasWordLikeChars) {
      contentFeatures.veryShortLowInfo = 1;
      details.veryShortLowInfo = 1;
    }
  }

  if (emojiCount > 0) {
    const emojiRatio = emojiCount / Math.max(1, charCount);
    details.emojiCount = emojiCount;
    details.emojiRatio = Number.isFinite(emojiRatio) ? Number(emojiRatio.toFixed(3)) : 0;

    const emojiOnly = textWithoutEmoji.length === 0;
    if (emojiOnly && !signals.isFollowupAfterBotReply) {
      contentFeatures.emojiOnly = 1;
      details.emojiOnly = 1;
    } else if (emojiRatio > 0.7 && tokenCount < 32) {
      contentFeatures.emojiRatioHigh = 1;
      details.highEmojiRatio = 1;
    } else if (emojiRatio > 0.4 && tokenCount < 32) {
      contentFeatures.emojiRatioMedium = 1;
      details.mediumEmojiRatio = 1;
    }
  }
  let urlMatches = [];
  try {
    urlMatches = linkify.match(text) || [];
  } catch {
    urlMatches = [];
  }
  if (urlMatches.length > 0) {
    const urlCharLen = urlMatches.reduce((sum, m) => sum + (m?.raw?.length || 0), 0);
    const urlRatio = urlCharLen / Math.max(1, charCount);
    details.urlCount = urlMatches.length;
    details.urlCharRatio = Number.isFinite(urlRatio) ? Number(urlRatio.toFixed(3)) : 0;
    if (urlRatio > 0.8 && tokenCount < 64) {
      contentFeatures.highUrlRatio = 1;
      details.highUrlRatio = 1;
    } else if (urlRatio > 0.5 && tokenCount < 64) {
      contentFeatures.mediumUrlRatio = 1;
      details.mediumUrlRatio = 1;
    }
  }

  let senderMaxSimilarity = 0;
  let groupMaxSimilarity = 0;
  if (decisionContext && typeof decisionContext === 'object') {
    const { sender_recent_messages: senderRecent, group_recent_messages: groupRecent } = decisionContext;
    if (Array.isArray(senderRecent) && senderRecent.length > 0) {
      for (const m of senderRecent) {
        const prevText = (m && (m.text || '')).trim();
        if (!prevText) continue;
        const sim = computeTextSimilarity(text, prevText);
        if (sim > senderMaxSimilarity) {
          senderMaxSimilarity = sim;
        }
      }
    }
    if (Array.isArray(groupRecent) && groupRecent.length > 0) {
      for (const m of groupRecent) {
        const prevText = (m && (m.text || '')).trim();
        if (!prevText) continue;
        const sim = computeTextSimilarity(text, prevText);
        if (sim > groupMaxSimilarity) {
          groupMaxSimilarity = sim;
        }
      }
    }
  }
  if (senderMaxSimilarity > 0) {
    details.senderMaxSimilarity = Number(senderMaxSimilarity.toFixed(3));
  }
  if (groupMaxSimilarity > 0) {
    details.groupMaxSimilarity = Number(groupMaxSimilarity.toFixed(3));
  }

  if (senderMaxSimilarity >= 0.9 && tokenCount <= 32 && !signals.isFollowupAfterBotReply) {
    contentFeatures.recentSenderDuplicate = 1;
    details.recentSenderDuplicate = 1;
  } else if (senderMaxSimilarity >= 0.8 && tokenCount <= 32 && !signals.isFollowupAfterBotReply) {
    contentFeatures.recentSenderNearDuplicate = 1;
    details.recentSenderNearDuplicate = 1;
  }

  // 5) 上下文信号：follow-up、fatigue 等
  if (signals.isFollowupAfterBotReply) {
    contentFeatures.followup = 1;
    details.followup = 1;
  }

  const senderFatigueRaw = typeof signals.senderFatigue === 'number' ? signals.senderFatigue : 0;
  const groupFatigueRaw = typeof signals.groupFatigue === 'number' ? signals.groupFatigue : 0;
  const senderFatigue = clamp01(senderFatigueRaw);
  const groupFatigue = clamp01(groupFatigueRaw);
  const senderReplyRate = typeof signals.senderReplyCountWindow === 'number'
    ? clamp01(signals.senderReplyCountWindow / 10)
    : 0;
  const groupReplyRate = typeof signals.groupReplyCountWindow === 'number'
    ? clamp01(signals.groupReplyCountWindow / 60)
    : 0;

  budgetFeatures.senderFatigue = senderFatigue;
  budgetFeatures.groupFatigue = groupFatigue;
  budgetFeatures.senderReplyRate = senderReplyRate;
  budgetFeatures.groupReplyRate = groupReplyRate;

  details.senderFatigue = senderFatigue;
  details.groupFatigue = groupFatigue;
  if (typeof signals.senderReplyCountWindow === 'number') {
    details.senderReplyCount = signals.senderReplyCountWindow;
  }
  if (typeof signals.groupReplyCountWindow === 'number') {
    details.groupReplyCount = signals.groupReplyCountWindow;
  }

  const modelConfig = getReplyGateModelConfig();
  const contentWeights = modelConfig.contentWeights || {};
  const budgetWeights = modelConfig.budgetWeights || {};

  const contentZ = applyLinearModel(contentFeatures, contentWeights);
  const pContent = sigmoid(contentZ);

  const budgetZ = applyLinearModel(budgetFeatures, budgetWeights);
  const budgetFactorRaw = sigmoid(budgetZ);
  const budgetFactor = clamp01(budgetFactorRaw);

  const probability = clamp01(pContent * budgetFactor);

  score = contentZ;

  details.contentFeatures = contentFeatures;
  details.budgetFeatures = budgetFeatures;
  details.contentZ = Number(contentZ.toFixed(3));
  details.budgetZ = Number(budgetZ.toFixed(3));
  details.pContent = Number(pContent.toFixed(3));
  details.budgetFactor = Number(budgetFactor.toFixed(3));
  details.probability = Number(probability.toFixed(3));

  return { score, details, tokenCount, probability };
}

/**
 * 评估一条群聊消息是否值得进入 LLM 决策或直接回复。
 * 不使用本地 ML 模型，只基于分词、token 统计和结构化信号。
 *
 * 返回决策：
 * - decision = 'ignore'  : 直接判定不回复
 * - decision = 'reply'   : 直接判定需要回复（无需再走决策 LLM）
 * - decision = 'llm'     : 交给 LLM 决策（灰度区间）
 */
export function assessReplyWorth(msg, signals = {}, options = {}) {
  const scene = msg?.type || 'unknown';
  const rawText = ((msg?.text && String(msg.text)) || (msg?.summary && String(msg.summary)) || '').trim();

  if (!isReplyGateEnabled()) {
    return {
      decision: 'llm',
      score: 0,
      normalizedScore: 1,
      reason: 'reply_gate_disabled',
      debug: { scene, rawTextLength: rawText.length }
    };
  }

  const isGroup = scene === 'group';

  // 私聊的 worth 评估交给上层（目前私聊默认必回）
  if (!isGroup) {
    return {
      decision: 'llm',
      score: 0,
      reason: 'non_group_message',
      debug: { scene, rawTextLength: rawText.length }
    };
  }

  if (!rawText) {
    // 群消息没有任何文本内容：通常不值得回复
    return {
      decision: 'ignore',
      score: 0,
      reason: 'empty_text',
      debug: { scene, rawTextLength: 0 }
    };
  }

  const { score, details, tokenCount, probability } = computeInterestScore(rawText, signals, options);

  const modelConfig = getReplyGateModelConfig();
  const baseHighProb = clamp01(modelConfig?.thresholds?.highProbability ?? 0.6);
  const baseLowProb = clamp01(modelConfig?.thresholds?.lowProbability ?? 0.25);

  let highThreshold;
  let lowThreshold;

  if (typeof options.highThreshold === 'number') {
    highThreshold = clamp01(options.highThreshold);
  } else {
    highThreshold = baseHighProb;
  }

  if (typeof options.lowThreshold === 'number') {
    lowThreshold = clamp01(options.lowThreshold);
  } else {
    lowThreshold = baseLowProb;
  }

  if (lowThreshold > highThreshold) {
    const tmp = lowThreshold;
    lowThreshold = highThreshold;
    highThreshold = tmp;
  }

  const prob = typeof probability === 'number' && Number.isFinite(probability)
    ? clamp01(probability)
    : clamp01((score - lowThreshold) / Math.max(1e-6, highThreshold - lowThreshold));

  let decision = 'llm';
  let reason = '';

  if (prob <= lowThreshold) {
    decision = 'ignore';
    reason = 'low_interest_probability';
  } else {
    decision = 'llm';
    reason = prob >= highThreshold ? 'high_interest_probability' : 'ambiguous_probability_range';
  }

  const normalizedScore = prob;

  return {
    decision,
    score,
    normalizedScore,
    reason,
    debug: {
      scene,
      rawTextLength: rawText.length,
      tokenCount,
      details
    }
  };
}
