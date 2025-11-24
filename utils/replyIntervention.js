/**
 * 回复干预判断模块
 * 使用轻量级模型进行二次判断，决定是否真的需要回复
 */

import { createLogger } from './logger.js';
import { extractXMLTag } from './xmlUtils.js';
import { repairSentraDecision } from './formatRepair.js';

const logger = createLogger('ReplyIntervention');

// 移除 tools 定义，统一使用 XML 解析

/**
 * 构建干预判断的提示词（标准 Sentra XML 协议格式）
 */
function buildInterventionPrompt(msg, probability, threshold, state) {
  const isGroup = msg.type === 'group';
  const chatType = isGroup ? 'group' : 'private';
  const pace = state.avgMessageInterval > 0 ? `${state.avgMessageInterval.toFixed(0)}s` : 'unknown';
  const maxTextLength = 200;
  // 优先使用 summary 作为干预判断的核心语义，text 仅作为兜底
  const rawSummary = (typeof msg.summary === 'string' && msg.summary.trim()) ? msg.summary.trim() : '';
  const rawText = (typeof msg.text === 'string' && msg.text.trim()) ? msg.text.trim() : '';
  let messageText = rawSummary || rawText || '(empty)';
  if (messageText.length > maxTextLength) {
    messageText = messageText.substring(0, maxTextLength) + '...';
  }
  const flags = [];
  if (msg.image) {
    flags.push('[Contains Image]');
  }
  if (msg.file) {
    flags.push('[Contains File]');
  }
  const messageTextWithFlags = flags.length > 0 ? `${messageText}\n${flags.join('\n')}` : messageText;
  const isExplicitMention = isGroup && Array.isArray(msg.at_users) && msg.self_id != null && msg.at_users.some((id) => id === msg.self_id);
  let mentionInfo = '';
  if (isExplicitMention) {
    const senderName = msg.sender_name || `${msg.sender_id ?? ''}`;
    // 在群聊里被 @ 时，明确告诉轻量模型：XX 在群聊里面艾特了你，然后说：XXX
    mentionInfo = `提问者 ${senderName} 在群聊里面艾特了你，然后说:"${messageText}"\n\n`;
  }
  return `# Reply Decision Validator

You are a secondary validator for reply decisions. The base probability check has passed (${(probability * 100).toFixed(0)}% >= ${(threshold * 100).toFixed(0)}%), but you need to verify if a reply is **truly necessary** to avoid unnecessary responses.

## Input Context

**Chat Type**: ${chatType}
**Message Count**: ${state.messageCount} messages (ignored ${state.consecutiveIgnored} times)
**Pace**: Average interval ${pace}
**Base Probability**: ${(probability * 100).toFixed(0)}%

${mentionInfo}${rawSummary ? `**Message Summary (preferred)**:\n${rawSummary}\n\n` : ''}${rawText && !rawSummary ? `**Original Text**:\n${rawText}\n\n` : ''}**Current Message (truncated, with flags)**:
\`\`\`
${messageTextWithFlags}
\`\`\`

## Decision Criteria

When the input context contains a line like:
"提问者 … 在群聊里面艾特了你，然后说：\"…\""，
it means the user explicitly mentioned you in a group chat. In that case, you should normally prefer need=true, unless the message is clearly empty, pure spam, or meaningless.

**SHOULD Reply (need=true)**:
- Explicit help requests or questions
- Tasks with clear intent or clear instructions
- Valuable topic discussions or meaningful follow-ups
- Content requiring acknowledgment, emotional support, or feedback
- Explicit @ mention to you in a group chat, as long as there is any understandable content or intent in the message

**SHOULD NOT Reply (need=false)**:
- Completely meaningless chitchat or obvious spam (even if it @ mentions you)
- Pure emojis, stickers, or filler words with no clear intent
- Repetitive messages or flooding that add no new information
- Rapid-fire messages in very fast-paced conversations (<20s interval) where another reply would be excessive
- Recent replies with no new topics (avoid over-engagement)
- For explicit @ mention, only choose need=false when the message is essentially empty, trolling, or clearly better left without a reply

## Output Format (CRITICAL)

**MUST use Sentra XML Protocol format**:

\`\`\`xml
<sentra-decision>
  <need>true</need>
  <reason>用户询问具体问题</reason>
  <confidence>0.85</confidence>
</sentra-decision>
\`\`\`

**Field Requirements**:
- \`<need>\`: Boolean (true/false), primary decision
- \`<reason>\`: String (max 20 characters), concise explanation in Chinese
- \`<confidence>\`: Float (0.0-1.0), your confidence level

**DO NOT**:
- Include explanations outside the XML block
- Use markdown formatting inside XML tags
- Omit any required fields`;
}

/**
 * 解析 Sentra XML 格式的决策结果
 * 使用 xmlUtils 的 extractXMLTag 进行更可靠的解析
 */
function parseDecisionXML(xmlText) {
  // 1. 先提取整个 <sentra-decision> 块
  const decisionBlock = extractXMLTag(xmlText, 'sentra-decision');
  if (!decisionBlock) {
    logger.debug('未找到 <sentra-decision> 标签');
    return null;
  }
  
  // 2. 从决策块中提取各字段
  const needStr = extractXMLTag(decisionBlock, 'need');
  const reason = extractXMLTag(decisionBlock, 'reason');
  const confidenceStr = extractXMLTag(decisionBlock, 'confidence');
  
  // 3. 验证必填字段
  if (!needStr || !reason || !confidenceStr) {
    logger.debug(`决策字段不完整: need=${needStr}, reason=${reason}, confidence=${confidenceStr}`);
    return null;
  }
  
  // 4. 解析和验证值
  const need = needStr.toLowerCase() === 'true';
  const confidence = parseFloat(confidenceStr);
  
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    logger.debug(`置信度无效: ${confidenceStr}`);
    return null;
  }
  
  return {
    need,
    reason: reason.trim(),
    confidence
  };
}

/**
 * 执行干预判断
 * @param {Object} agent - Agent 实例
 * @param {Object} msg - 消息对象
 * @param {number} probability - 基础概率
 * @param {number} threshold - 阈值
 * @param {Object} state - 会话状态
 * @param {Object} [options] - 附加选项（如是否来自对话跟进窗口）
 * @returns {Promise<{need: boolean, reason: string, confidence: number}>}
 */
export async function executeIntervention(agent, msg, probability, threshold, state, options = {}) {
  const model = process.env.REPLY_INTERVENTION_MODEL;
  const timeout = parseInt(process.env.REPLY_INTERVENTION_TIMEOUT || '2000');
  const onlyNearThresholdEnv = process.env.REPLY_INTERVENTION_ONLY_NEAR_THRESHOLD === 'true';
  // 显式@ 提及时强制进行干预判断（无视 onlyNearThreshold 限制）
  const isExplicitMention = Array.isArray(msg?.at_users) && msg?.self_id != null && msg.at_users.some((id) => id === msg.self_id);
  const fromFollowupConversation = !!options?.fromFollowupConversation;
  const onlyNearThreshold = (isExplicitMention || fromFollowupConversation) ? false : onlyNearThresholdEnv;
  
  if (!model) {
    logger.warn('未配置 REPLY_INTERVENTION_MODEL，跳过干预判断');
    return { need: true, reason: '未配置干预模型', confidence: 0.5 };
  }
  
  // 仅在临界区间触发（可选优化）
  if (onlyNearThreshold) {
    const distance = Math.abs(probability - threshold);
    if (distance > 0.15) {
      logger.debug(`概率距离阈值${(distance * 100).toFixed(1)}% > 15%，跳过干预判断`);
      return { need: true, reason: '概率差距较大，跳过干预', confidence: 1.0 };
    }
  }
  
  try {
    logger.debug(`启动干预判断: model=${model}, prob=${(probability * 100).toFixed(1)}%, threshold=${(threshold * 100).toFixed(1)}%`);
    
    const systemPrompt = buildInterventionPrompt(msg, probability, threshold, state);
    const summary = (typeof msg.summary === 'string' && msg.summary.trim()) ? msg.summary.trim() : '';
    const originalText = (typeof msg.text === 'string' && msg.text.trim()) ? msg.text.trim() : '';
    const userContent = summary || originalText || '(无文本内容)';
    const userPrompt = `请根据以上上下文，判断这条用户消息是否需要回复（优先基于 summary）：\n\n${userContent}`;
    
    // 使用 tools + tool_choice 强制函数调用
    const startTime = Date.now();
    const response = await Promise.race([
      agent.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          model: model,
          temperature: 0.3,
          max_tokens: 300
        }
      ),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
    
    const elapsed = Date.now() - startTime;
    
    // 统一使用 XML 解析
    const responseText = response.content || (typeof response === 'string' ? response : '');
    
    if (!responseText) {
      logger.warn('干预判断返回内容为空，判定为不需要回复');
      return { need: false, reason: '干预返回为空', confidence: 0.0, aborted: true };
    }
    
    try {
      const xmlResult = parseDecisionXML(responseText);
      if (xmlResult) {
        logger.info(`干预判断完成(${elapsed}ms): need=${xmlResult.need}, reason="${xmlResult.reason}", confidence=${xmlResult.confidence}`);
        return xmlResult;
      }
    } catch (xmlError) {
      logger.warn('XML 解析失败', xmlError);
    }

    // 尝试使用格式修复器
    try {
      const enableRepair = (process.env.ENABLE_FORMAT_REPAIR || 'true') === 'true';
      if (enableRepair && typeof responseText === 'string' && responseText.trim()) {
        const repairedXML = await repairSentraDecision(responseText, { agent, model: process.env.REPAIR_AI_MODEL });
        const repaired = parseDecisionXML(repairedXML);
        if (repaired) {
          logger.info(`干预判断(修复后)完成(${elapsed}ms): need=${repaired.need}, reason="${repaired.reason}", confidence=${repaired.confidence}`);
          return repaired;
        }
      }
    } catch (repairErr) {
      logger.warn('干预判断格式修复失败', repairErr);
    }

    // 失败：明确视为不需要回复
    logger.warn('干预判断未返回有效结果，视为不需要回复');
    return { need: false, reason: '干预无效结果', confidence: 0.0, aborted: true };
    
  } catch (error) {
    if (error.message === 'Timeout') {
      logger.warn(`干预判断超时(${timeout}ms)，视为不需要回复`);
    } else {
      logger.error(`干预判断失败: ${error.message}，视为不需要回复`);
    }
    return { need: false, reason: '干预超时或失败', confidence: 0.0, aborted: true };
  }
}

/**
 * 检查是否应该启用干预判断
 */
export function shouldEnableIntervention() {
  const enabled = process.env.ENABLE_REPLY_INTERVENTION === 'true';
  const hasModel = !!process.env.REPLY_INTERVENTION_MODEL;
  
  if (enabled && !hasModel) {
    logger.warn('ENABLE_REPLY_INTERVENTION=true 但未配置 REPLY_INTERVENTION_MODEL');
    return false;
  }
  
  return enabled;
}

/**
 * 获取干预配置
 */
export function getInterventionConfig() {
  return {
    enabled: shouldEnableIntervention(),
    model: process.env.REPLY_INTERVENTION_MODEL || 'gpt-4o-mini',
    timeout: parseInt(process.env.REPLY_INTERVENTION_TIMEOUT || '2000'),
    onlyNearThreshold: process.env.REPLY_INTERVENTION_ONLY_NEAR_THRESHOLD === 'true',
    desireReduction: parseFloat(process.env.REPLY_INTERVENTION_DESIRE_REDUCTION || '0.10')
  };
}
