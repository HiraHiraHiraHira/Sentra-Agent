import logger from '../../logger/index.js';
import { config, getStageModel, getStageProvider, getStageTimeoutMs } from '../../config/index.js';
import { chatCompletion } from '../../openai/client.js';
import { loadPrompt, renderTemplate, composeSystem } from '../prompts/loader.js';
import { compactMessages } from '../utils/messages.js';
import { buildFCPolicy, buildFunctionCallInstruction, parseFunctionCalls, formatSentraResult } from '../../utils/fc.js';
import { manifestToBulletedText, manifestToXmlToolsCatalog } from '../plan/manifest.js';
import { loadToolDef } from '../tools/loader.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function normBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function clipText(s, maxChars) {
  const t = String(s ?? '');
  const lim = Math.max(0, Number(maxChars) || 0);
  if (!lim) return t;
  return t.length > lim ? t.slice(0, lim) : t;
}

function summarizeRemainingPlan(steps = [], startIndex = 0) {
  const items = [];
  for (let i = startIndex; i < steps.length; i++) {
    const s = steps[i] || {};
    const displayIndex = Number.isFinite(Number(s.displayIndex)) ? Number(s.displayIndex) : (i + 1);
    const line = {
      index: i,
      displayIndex,
      stepId: typeof s.stepId === 'string' ? s.stepId : '',
      aiName: s.aiName || '',
      dependsOnStepIds: Array.isArray(s.dependsOnStepIds) ? s.dependsOnStepIds : [],
      reason: Array.isArray(s.reason) ? s.reason : [],
      draftArgs: s.draftArgs || {},
      skip: s.skip === true
    };
    items.push(line);
  }
  return JSON.stringify(items, null, 2);
}

function summarizeRecentContext(items = []) {
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it || typeof it !== 'object') continue;
    const type = String(it.type || '').trim();
    if (!type) continue;
    if (type !== 'tool_result' && type !== 'arggen_error' && type !== 'tool_error') continue;
    out.push({
      type,
      plannedStepIndex: Number.isFinite(Number(it.plannedStepIndex)) ? Number(it.plannedStepIndex) : undefined,
      stepId: typeof it.stepId === 'string' ? it.stepId : undefined,
      aiName: it.aiName,
      reason: it.reason,
      args: it.args,
      result: it.result,
      error: it.error,
      message: it.message
    });
  }
  return JSON.stringify(out, null, 2);
}

function summarizeHistoryContext(items = []) {
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it || typeof it !== 'object') continue;
    const type = String(it.type || '').trim();
    if (!type) continue;
    if (type === 'tool_result') {
      out.push({
        type,
        plannedStepIndex: Number.isFinite(Number(it.plannedStepIndex)) ? Number(it.plannedStepIndex) : undefined,
        stepId: typeof it.stepId === 'string' ? it.stepId : undefined,
        aiName: it.aiName,
        result: it.result,
      });
    } else if (type === 'retry_begin' || type === 'retry_done') {
      out.push({
        type,
        failedSteps: it.failedSteps,
        repairIndex: it.repairIndex,
      });
    } else if (type === 'plan_patch') {
      out.push({
        type,
        action: it.action,
        reason: it.reason,
        atIndex: it.atIndex,
        atStepId: it.atStepId,
        operations: it.operations,
      });
    } else if (type === 'arggen_error' || type === 'tool_error') {
      out.push({ type, stepId: it.stepId, aiName: it.aiName, error: it.error, message: it.message });
    }
  }
  return JSON.stringify(out, null, 2);
}

export async function maybePlanPatch({ runId, objective, plan, currentIndex, lastResult, mcpcore, conversation, context, initialPlan, recentContext, historyContext, trigger } = {}) {
  try {
    const steps = Array.isArray(plan?.steps) ? plan.steps : [];
    const currentStep = steps[currentIndex] || {};
    const displayIndex = Number.isFinite(Number(currentStep.displayIndex)) ? Number(currentStep.displayIndex) : (currentIndex + 1);
    const stepId = typeof currentStep.stepId === 'string' ? currentStep.stepId : '';
    const totalSteps = steps.length;

    const enable = normBool(config.runner?.enablePlanPatch) || normBool(process.env.ENABLE_PLAN_PATCH);
    if (!enable) return { action: 'continue', reason: 'disabled', operations: [] };

    const strategy = String(config.llm?.toolStrategy || 'auto');
    const useFC = strategy === 'fc';

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const toolDef = await loadToolDef({
      baseDir: __dirname,
      toolPath: '../tools/internal/emit_plan_patch.tool.json',
      schemaPath: '../tools/internal/emit_plan_patch.schema.json',
      fallbackTool: { type: 'function', function: { name: 'emit_plan_patch', description: 'emit patch operations for remaining plan steps', parameters: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] } } },
      fallbackSchema: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] },
    });

    const promptName = useFC ? 'plan_patch_fc' : 'plan_patch';
    const pp = await loadPrompt(promptName);
    const overlays = (context?.promptOverlays || context?.overlays || {});
    const overlayGlobal = overlays.global?.system || overlays.global || '';
    const overlayPatch = overlays.plan_patch?.system || overlays.plan_patch || overlays.planpatch || '';

    let sys;
    if (useFC) {
      const policy = await buildFCPolicy({ locale: 'en' });
      const userSystem = [overlayGlobal, overlayPatch, pp.system].filter(Boolean).join('\n\n');
      sys = userSystem
        ? `${policy}\n\n---\n【Protocol Requirements】Above is system protocol, must be strictly followed. Below are specific task settings and requirements:\n---\n\n${userSystem}`
        : policy;
    } else {
      sys = composeSystem(pp.system, [overlayGlobal, overlayPatch].filter(Boolean).join('\n\n'));
    }

    const manifestArr = Array.isArray(plan?.manifest) ? plan.manifest : (mcpcore ? (mcpcore.getAvailableTools?.() || []) : []);
    const manifestText = useFC ? manifestToXmlToolsCatalog(manifestArr) : manifestToBulletedText(manifestArr);

    const lastResultXml = lastResult && typeof lastResult === 'object'
      ? formatSentraResult({
          stepIndex: Number(lastResult.plannedStepIndex ?? currentIndex),
          stepId: lastResult.stepId,
          aiName: lastResult.aiName,
          reason: lastResult.reason,
          args: lastResult.args,
          result: lastResult.result
        })
      : '';

    const remainingPlan = summarizeRemainingPlan(steps, Math.min(steps.length, currentIndex + 1));
    const initialPlanText = initialPlan && typeof initialPlan === 'object'
      ? summarizeRemainingPlan(Array.isArray(initialPlan.steps) ? initialPlan.steps : [], 0)
      : '';
    const recentContextText = summarizeRecentContext(Array.isArray(recentContext) ? recentContext : []);
    const historyContextText = summarizeHistoryContext(Array.isArray(historyContext) ? historyContext : []);

    const vars = {
      objective: String(objective || ''),
      displayIndex: String(displayIndex),
      totalSteps: String(totalSteps),
      stepId: String(stepId || ''),
      lastResultXml: clipText(lastResultXml, 8000),
      lastResultJson: clipText(JSON.stringify(lastResult || {}, null, 2), 8000),
      remainingPlan: clipText(remainingPlan, 10000),
      initialPlan: clipText(initialPlanText, 12000),
      recentToolContext: clipText(recentContextText, 12000),
      executionHistory: clipText(historyContextText, 14000),
      trigger: clipText(String(trigger || ''), 1000),
      manifestText
    };

    const userTask = renderTemplate(pp.user_task, vars);

    if (useFC) {
      const instr = await buildFunctionCallInstruction({
        name: 'emit_plan_patch',
        parameters: toolDef.function?.parameters || { type: 'object', properties: {} },
        locale: 'en'
      });
      const messages = compactMessages([
        { role: 'system', content: sys },
        ...(Array.isArray(conversation) ? conversation : []),
        { role: 'assistant', content: manifestText || '' },
        { role: 'user', content: [userTask, instr].filter(Boolean).join('\n\n') }
      ]);

      const provider = getStageProvider('plan_patch') || getStageProvider('plan');
      const model = getStageModel('plan_patch') || getStageModel('plan');
      const resp = await chatCompletion({
        messages,
        temperature: Math.max(0.05, Number(config.fcLlm?.planTemperature ?? 0.1)),
        timeoutMs: getStageTimeoutMs('plan_patch') || getStageTimeoutMs('plan'),
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
        model,
        ...(Number.isFinite(config.fcLlm?.maxTokens) && config.fcLlm.maxTokens > 0 ? { max_tokens: config.fcLlm.maxTokens } : { omitMaxTokens: true })
      });
      const content = resp?.choices?.[0]?.message?.content || '';
      const calls = parseFunctionCalls(String(content), { format: (config.fcLlm?.format || 'sentra') });
      const call = calls.find((c) => String(c.name) === 'emit_plan_patch') || calls[0];
      const args = call?.arguments || {};
      const action = String(args.action || 'continue');
      const isComplete = args.isComplete === true;
      const operations = Array.isArray(args.operations) ? args.operations : [];
      const reason = String(args.reason || '');
      return { action, isComplete, reason, operations };
    }

    const tools = [toolDef];
    const messages = compactMessages([
      { role: 'system', content: sys },
      ...(Array.isArray(conversation) ? conversation : []),
      { role: 'assistant', content: manifestText || '' },
      { role: 'user', content: userTask }
    ]);

    const resp = await chatCompletion({
      messages,
      tools,
      tool_choice: { type: 'function', function: { name: 'emit_plan_patch' } },
      temperature: 0.1,
      timeoutMs: getStageTimeoutMs('plan_patch') || getStageTimeoutMs('plan')
    });

    const call = resp.choices?.[0]?.message?.tool_calls?.[0];
    let parsed = {};
    try { parsed = call?.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch { parsed = {}; }
    const action = String(parsed.action || 'continue');
    const isComplete = parsed.isComplete === true;
    const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
    const reason = String(parsed.reason || '');
    return { action, isComplete, reason, operations };
  } catch (e) {
    logger.warn?.('PlanPatch failed (ignored)', { label: 'PLAN_PATCH', error: String(e) });
    return { action: 'continue', isComplete: false, reason: 'error', operations: [] };
  }
}

export default { maybePlanPatch };
