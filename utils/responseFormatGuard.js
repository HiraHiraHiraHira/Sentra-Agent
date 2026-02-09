import { createLogger } from './logger.js';
import { randomUUID } from 'node:crypto';
import { extractAllFullXMLTags, tryParseXmlFragment, escapeXml } from './xmlUtils.js';
import { getEnvBool } from './envHotReloader.js';
import { repairSentraResponse } from './formatRepair.js';

const logger = createLogger('ResponseFormatGuard');

function extractFirstFullTag(text, tagName) {
  const s = typeof text === 'string' ? text : '';
  if (!s.trim()) return null;
  const blocks = extractAllFullXMLTags(s, tagName);
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  return String(blocks[0] || '').trim() || null;
}

function isLikelySentraResponseBlock(xml) {
  if (!xml || typeof xml !== 'string') return false;
  if (!xml.includes('<sentra-response')) return false;
  if (!xml.includes('</sentra-response>')) return false;
  const parsed = tryParseXmlFragment(xml, 'root');
  if (!parsed || typeof parsed !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(parsed, 'sentra-response');
}

export function guardAndNormalizeSentraResponse(rawResponse, opts = {}) {
  const enabled = opts.enabled ?? getEnvBool('ENABLE_LOCAL_FORMAT_GUARD', true);
  if (!enabled) {
    return { ok: true, normalized: rawResponse, changed: false };
  }

  const response = typeof rawResponse === 'string' ? rawResponse : String(rawResponse ?? '');
  const trimmed = response.trim();
  if (!trimmed) {
    return { ok: false, normalized: null, changed: false, reason: '响应为空' };
  }

  // If already a pure block, keep it.
  if (trimmed.startsWith('<sentra-response') && trimmed.endsWith('</sentra-response>') && isLikelySentraResponseBlock(trimmed)) {
    return { ok: true, normalized: trimmed, changed: false };
  }

  // Prefer: extract the first full <sentra-response>...</sentra-response> block and drop the rest.
  const first = extractFirstFullTag(trimmed, 'sentra-response');
  if (first && isLikelySentraResponseBlock(first)) {
    try {
      logger.warn('检测到 sentra-response 外存在额外内容，已本地截取第一段 sentra-response 放行');
    } catch { }
    return { ok: true, normalized: first, changed: true, reason: 'trim_to_first_sentra_response' };
  }

  return {
    ok: false,
    normalized: null,
    changed: false,
    reason: '缺少或无法解析 <sentra-response> 标签'
  };
}

export function shouldAttemptModelFormatFix({ expectedOutput, lastErrorReason, alreadyTried } = {}) {
  if (alreadyTried) return false;
  const enabled = getEnvBool('ENABLE_MODEL_FORMAT_FIX', true);
  if (!enabled) return false;
  if (String(expectedOutput || 'sentra_response') !== 'sentra_response') return false;
  const reason = String(lastErrorReason || '').trim();
  if (!reason) return true;
  return true;
}

export function buildSentraResponseFormatFixRootDirectiveXml({
  lastErrorReason,
  candidateOutput,
  scope = 'single_turn'
} = {}) {
  const reason = String(lastErrorReason || '').trim();
  const candidate = String(candidateOutput || '').trim();
  return [
    '<sentra-root-directive>',
    `  <id>format_fix_${randomUUID()}</id>`,
    '  <type>format_fix</type>',
    `  <scope>${scope}</scope>`,
    '  <phase>FormatFix</phase>',
    '  <objective>你的任务是：修复 candidate_output 的格式，使其符合 Sentra 协议。你必须保留原意与资源信息（如有），但最终输出必须严格合规。</objective>',
    '  <allow_tools>false</allow_tools>',
    (reason
      ? `  <last_error>${escapeXml(reason.slice(0, 400))}</last_error>`
      : ''),
    (candidate
      ? [
        '  <candidate_output>',
        `    ${escapeXml(candidate)}`,
        '  </candidate_output>'
      ].join('\n')
      : ''),
    '  <constraints>',
    '    <item>你必须且只能输出一个顶层块：<sentra-response>...</sentra-response>；除此之外不要输出任何字符、解释、前后缀。</item>',
    '    <item>禁止输出 <sentra-tools>、<sentra-result>、<sentra-user-question> 等任何只读标签。</item>',
    '    <item>如果 candidate_output 缺少必需字段，请以最小改动补齐：至少包含一个非空 <text1>，并包含 <resources></resources>（若无资源）。</item>',
    '  </constraints>',
    '</sentra-root-directive>'
  ]
    .filter((x) => x !== '')
    .join('\n');
}

export async function attemptModelFormatFixWithAgent({
  agent,
  conversations,
  model,
  timeout,
  groupId,
  lastErrorReason,
  candidateOutput
} = {}) {
  if (!agent || typeof agent.chat !== 'function') return null;
  const conv = Array.isArray(conversations) ? conversations : [];
  const rootXml = buildSentraResponseFormatFixRootDirectiveXml({
    lastErrorReason,
    candidateOutput,
    scope: 'single_turn'
  });

  // 复用原上下文，追加一次“格式修复 root 指令”作为 user turn
  const fixConversations = [...conv, { role: 'user', content: rootXml }];

  let out;
  try {
    out = await agent.chat(fixConversations, {
      model,
      temperature: 0.2,
      maxTokens: 600,
      timeout
    });
  } catch (e) {
    try {
      logger.warn(`[${groupId || 'format_fix'}] 模型格式修复调用失败`, { err: String(e) });
    } catch { }
    return null;
  }

  const raw = typeof out === 'string' ? out : String(out ?? '');
  const guarded = guardAndNormalizeSentraResponse(raw);
  if (guarded && guarded.ok && guarded.normalized) {
    return guarded.normalized;
  }
  return null;
}

export async function repairSentraResponseWithLLM({ rawText, agent, model } = {}) {
  const enabled = getEnvBool('ENABLE_FORMAT_REPAIR', true);
  if (!enabled) return null;
  const text = typeof rawText === 'string' ? rawText : String(rawText ?? '');
  if (!text.trim()) return null;
  try {
    const fixed = await repairSentraResponse(text, { agent, model });
    const guarded = guardAndNormalizeSentraResponse(fixed);
    if (guarded && guarded.ok && guarded.normalized) {
      return guarded.normalized;
    }
    return fixed;
  } catch {
    return null;
  }
}

export async function runSentraResponseFixPipeline({
  agent,
  conversations,
  model,
  timeout,
  groupId,
  expectedOutput = 'sentra_response',
  lastErrorReason,
  candidateOutput
} = {}) {
  if (String(expectedOutput || '') !== 'sentra_response') return null;
  const candidate = typeof candidateOutput === 'string' ? candidateOutput : String(candidateOutput ?? '');
  if (!candidate.trim()) return null;

  // 1) local guard (extract first sentra-response)
  const guarded = guardAndNormalizeSentraResponse(candidate);
  if (guarded && guarded.ok && guarded.normalized) {
    return guarded.normalized;
  }

  // 2) model format_fix (root directive)
  const fixedByModel = await attemptModelFormatFixWithAgent({
    agent,
    conversations,
    model,
    timeout,
    groupId,
    lastErrorReason,
    candidateOutput: candidate
  });
  if (fixedByModel && typeof fixedByModel === 'string' && fixedByModel.trim()) {
    return fixedByModel;
  }

  // 3) LLM repair tool
  const fixedByRepair = await repairSentraResponseWithLLM({ rawText: candidate, agent, model });
  if (fixedByRepair && typeof fixedByRepair === 'string' && fixedByRepair.trim()) {
    return fixedByRepair;
  }

  return null;
}
