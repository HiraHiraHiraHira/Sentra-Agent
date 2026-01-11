import { createLogger } from './logger.js';

import { createRagSdk } from 'sentra-rag';

const logger = createLogger('RagIngestQueue');

function serializeRagError(err) {
  try {
    const e = err && typeof err === 'object' ? err : { message: String(err) };
    const status = e.status ?? e.statusCode ?? e.code ?? null;
    const name = e.name ?? null;
    const message = e.message ?? String(err);
    const requestId = e.request_id ?? e.requestId ?? null;
    const type = e.type ?? e.error?.type ?? null;
    const errorMessage = e.error?.message ?? null;
    const errorParam = e.error?.param ?? null;
    const errorCode = e.error?.code ?? null;
    const body = e.response?.data ?? e.body ?? null;
    return {
      name,
      status,
      message,
      requestId,
      type,
      errorMessage,
      errorParam,
      errorCode,
      body,
    };
  } catch {
    return { message: String(err) };
  }
}

function sanitizeIngestText(rawText) {
  const text = String(rawText ?? '');
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const maxCharsRaw = Number(process.env.RAG_INGEST_MAX_CHARS ?? process.env.rag_INGEST_MAX_CHARS ?? 50000);
  const maxChars = Number.isFinite(maxCharsRaw) && maxCharsRaw > 0 ? maxCharsRaw : 0;
  if (maxChars > 0 && cleaned.length > maxChars) {
    return cleaned.slice(0, maxChars);
  }
  return cleaned;
}

const queue = [];
let running = false;

let ragSdkPromise = null;
async function getRagSdk() {
  if (!ragSdkPromise) {
    ragSdkPromise = createRagSdk().catch((e) => {
      ragSdkPromise = null;
      throw e;
    });
  }
  return ragSdkPromise;
}

async function runLoop() {
  if (running) return;
  running = true;

  try {
    logger.info('RAG 入库队列开始消费', { pending: queue.length });
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) continue;

      const text = String(job.text || '').trim();
      const docId = String(job.docId || '').trim();
      const title = String(job.title || '').trim();
      const source = String(job.source || '').trim();
      const contextText = typeof job.contextText === 'string' ? job.contextText : '';

      if (!text || !docId) {
        logger.warn('RAG 入库任务缺少 text/docId，已跳过', { docId: docId || '', hasText: !!text });
        continue;
      }

      try {
        logger.info('RAG 入库处理中', { docId, remaining: queue.length });
        const rag = await getRagSdk();
        const safeText = sanitizeIngestText(text);
        if (safeText.length !== text.length) {
          logger.info('RAG 入库文本已清洗/截断', { docId, beforeChars: text.length, afterChars: safeText.length });
        }
        await rag.ingestText(safeText, {
          docId,
          title: title || docId,
          source: source || 'sentra_chat',
          contextText,
        });
        logger.info('RAG 入库完成', { docId });
      } catch (e) {
        logger.warn('RAG 入库失败（已忽略）', { docId, err: serializeRagError(e) });
      }
    }
  } finally {
    running = false;
  }
}

export function enqueueRagIngest({ text, docId, title, source, contextText } = {}) {
  queue.push({ text, docId, title, source, contextText });
  logger.info('RAG 入库任务入队', { docId: String(docId || ''), pending: queue.length });
  if (!running) {
    setTimeout(() => {
      runLoop().catch((e) => {
        logger.warn('RAG 入库队列运行异常（已忽略）', { err: String(e) });
      });
    }, 0);
  }
}
