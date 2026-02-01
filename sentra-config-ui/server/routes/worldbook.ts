import { FastifyInstance } from 'fastify';
import { join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { TextDecoder } from 'util';
import dotenv from 'dotenv';

function getRootDir(): string {
  return resolve(process.cwd(), process.env.SENTRA_ROOT || '..');
}

let cachedRootEnv: Record<string, string> | null = null;
function getRootEnvValue(key: string): string {
  try {
    if (!cachedRootEnv) {
      const envPath = join(getRootDir(), '.env');
      if (existsSync(envPath)) {
        cachedRootEnv = dotenv.parse(readFileSync(envPath));
      } else {
        cachedRootEnv = {};
      }
    }
    return (cachedRootEnv && typeof cachedRootEnv[key] === 'string') ? String(cachedRootEnv[key] || '') : '';
  } catch {
    return '';
  }
}

function extractFirstTagBlock(text: string, tagName: string): string {
  if (!text || !tagName) return '';
  const re = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, 'i');
  const m = String(text).match(re);
  return m ? m[0] : '';
}

function extractWorldbookPayloadText(xmlBlock: string): string {
  const m = xmlBlock.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  if (m) return String(m[1] || '').trim();
  const stripped = xmlBlock
    .replace(/^<sentra-worldbook[^>]*>/i, '')
    .replace(/<\/sentra-worldbook\s*>$/i, '')
    .trim();
  return stripped;
}

async function callChatCompletions(params: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  messages: any[];
}) {
  const normalizedBase = params.apiBaseUrl.replace(/\/+$/, '');
  const baseWithV1 = /\/v1$/i.test(normalizedBase) ? normalizedBase : `${normalizedBase}/v1`;
  const url = `${baseWithV1}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature,
      max_tokens: typeof params.maxTokens === 'number' ? params.maxTokens : undefined,
      stream: false,
      messages: params.messages,
    }),
  } as any);

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upstream error ${res.status}: ${text}`);
  }
  const json = JSON.parse(text);
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : String(content ?? '');
}

function writeSse(reply: any, payload: any, event?: string) {
  if (event) {
    reply.raw.write(`event: ${event}\\n`);
  }
  reply.raw.write(`data: ${JSON.stringify(payload)}\\n\\n`);
  if (typeof reply.raw.flush === 'function') {
    try { reply.raw.flush(); } catch { }
  }
  if (typeof reply.raw.flushHeaders === 'function') {
    try { reply.raw.flushHeaders(); } catch { }
  }
}

async function callChatCompletionsStream(params: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  messages: any[];
  onDelta: (delta: string) => void;
}) {
  const normalizedBase = params.apiBaseUrl.replace(/\/+$/, '');
  const baseWithV1 = /\/v1$/i.test(normalizedBase) ? normalizedBase : `${normalizedBase}/v1`;
  const url = `${baseWithV1}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature,
      max_tokens: typeof params.maxTokens === 'number' ? params.maxTokens : undefined,
      stream: true,
      messages: params.messages,
    }),
  } as any);

  const contentType = String((res.headers as any)?.get?.('content-type') || '');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstream error ${res.status}: ${text}`);
  }

  if (!/text\/event-stream/i.test(contentType) || !(res as any).body) {
    const text = await res.text();
    const json = JSON.parse(text);
    const content = json?.choices?.[0]?.message?.content;
    const full = typeof content === 'string' ? content : String(content ?? '');
    if (full) {
      const chunkSize = 80;
      for (let i = 0; i < full.length; i += chunkSize) {
        const chunk = full.slice(i, i + chunkSize);
        if (chunk) params.onDelta(chunk);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return full;
  }

  const decoder = new TextDecoder();
  const body: any = (res as any).body;
  const reader = typeof body.getReader === 'function' ? body.getReader() : null;
  let buffer = '';
  let fullText = '';

  const handleFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    const dataLines = lines.filter((l) => l.startsWith('data:'));
    if (dataLines.length === 0) return;
    const dataStr = dataLines.map((l) => l.slice(5).trim()).join('\n');
    if (!dataStr) return;
    if (dataStr === '[DONE]') return;
    let json: any;
    try {
      json = JSON.parse(dataStr);
    } catch {
      return;
    }
    const delta = json?.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      fullText += delta;
      params.onDelta(delta);
    }
  };

  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true } as any);
      let idx;
      while ((idx = buffer.indexOf('\\n\\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleFrame(frame);
      }
    }
  } else if (body && (Symbol.asyncIterator in body)) {
    for await (const chunk of body) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true } as any);
      let idx;
      while ((idx = buffer.indexOf('\\n\\n')) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleFrame(frame);
      }
    }
  }

  return fullText;
}

export async function worldbookRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      text: string;
      apiBaseUrl?: string;
      apiKey?: string;
      model?: string;
      temperature?: number;
      stream?: boolean;
      maxTokens?: number;
    };
  }>('/api/worldbook/generate', async (request, reply) => {
    try {
      const body = request.body || ({} as any);
      const rawText = typeof body.text === 'string' ? body.text.trim() : '';
      if (!rawText) {
        return reply.code(400).send({ error: 'Missing text' });
      }

      const rootDir = getRootDir();
      const localPromptPath = join(process.cwd(), 'server', 'prompts', 'worldbook_generator.json');
      const promptPath = existsSync(localPromptPath)
        ? localPromptPath
        : join(rootDir, 'prompts', 'worldbook_generator.json');

      if (!existsSync(promptPath)) {
        return reply.code(500).send({ error: 'Missing worldbook_generator prompt', message: `Not found: ${promptPath}` });
      }

      const promptJson = JSON.parse(readFileSync(promptPath, 'utf-8')) as any;
      const fileMessages = Array.isArray(promptJson?.messages) ? promptJson.messages : null;
      const systemPrompt = typeof promptJson?.system === 'string' ? promptJson.system : '';
      const baseMessages = fileMessages
        ? fileMessages
          .filter((m: any) => m && typeof m.role === 'string' && typeof m.content === 'string')
          .map((m: any) => ({ role: m.role, content: m.content }))
        : null;

      if (baseMessages && baseMessages.length === 0) {
        return reply.code(500).send({ error: 'Invalid worldbook_generator prompt', message: 'Empty messages template' });
      }
      if (!baseMessages && !systemPrompt) {
        return reply.code(500).send({ error: 'Invalid worldbook_generator prompt', message: 'Missing system prompt' });
      }

      const apiBaseUrl = (typeof body.apiBaseUrl === 'string' ? body.apiBaseUrl : '')
        || getRootEnvValue('API_BASE_URL')
        || process.env.API_BASE_URL
        || '';
      const apiKey = (typeof body.apiKey === 'string' ? body.apiKey : '')
        || getRootEnvValue('API_KEY')
        || process.env.API_KEY
        || '';

      if (!apiBaseUrl || !apiKey) {
        return reply.code(500).send({
          error: 'Worldbook generator backend not configured',
          message: 'Missing apiBaseUrl/apiKey (either request override or root .env API_BASE_URL/API_KEY)',
        });
      }

      const model = (typeof body.model === 'string' && body.model.trim())
        ? body.model.trim()
        : (getRootEnvValue('WORLDBOOK_GENERATOR_MODEL')
          || getRootEnvValue('MAIN_AI_MODEL')
          || getRootEnvValue('MODEL_NAME')
          || process.env.MAIN_AI_MODEL
          || process.env.MODEL_NAME
          || 'gpt-4o-mini');

      const temperature = typeof body.temperature === 'number' ? body.temperature : 0.4;

      const maxTokensFromBody = typeof body.maxTokens === 'number' ? body.maxTokens : undefined;
      const maxTokensFromEnv = Number(getRootEnvValue('WORLDBOOK_GENERATOR_MAX_TOKENS') || process.env.WORLDBOOK_GENERATOR_MAX_TOKENS || '');
      const maxTokens = (Number.isFinite(maxTokensFromBody) && (maxTokensFromBody as number) > 0)
        ? (maxTokensFromBody as number)
        : (Number.isFinite(maxTokensFromEnv) && maxTokensFromEnv > 0 ? maxTokensFromEnv : undefined);

      const userContent = rawText;

      const messages = baseMessages
        ? baseMessages.concat([{ role: 'user', content: userContent }])
        : [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ];

      const wantsStream = !!body.stream;
      if (wantsStream) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        if (typeof (reply.raw as any).flushHeaders === 'function') {
          try { (reply.raw as any).flushHeaders(); } catch { }
        }

        reply.raw.write(`: stream-open\\n\\n`);
        const heartbeat = setInterval(() => {
          try {
            reply.raw.write(`event: ping\\n` + `data: {}\\n\\n`);
          } catch { }
        }, 15000);

        let assistantText = '';
        try {
          assistantText = await callChatCompletionsStream({
            apiBaseUrl,
            apiKey,
            model,
            temperature,
            maxTokens,
            messages,
            onDelta: (delta) => {
              writeSse(reply, { type: 'token', delta });
            },
          });
        } catch (e: any) {
          writeSse(reply, { type: 'error', message: e?.message || String(e) }, 'error');
          clearInterval(heartbeat);
          reply.raw.end();
          return;
        }

        const wbXml = extractFirstTagBlock(assistantText, 'sentra-worldbook');
        if (!wbXml) {
          writeSse(reply, { type: 'error', message: 'Missing <sentra-worldbook> block in LLM output', raw: assistantText }, 'error');
          clearInterval(heartbeat);
          reply.raw.end();
          return;
        }

        const jsonText = extractWorldbookPayloadText(wbXml);
        let worldbookJson: any;
        try {
          worldbookJson = JSON.parse(jsonText);
        } catch (e: any) {
          writeSse(reply, { type: 'error', message: e?.message || 'Failed to parse worldbook JSON', worldbookXml: wbXml }, 'error');
          clearInterval(heartbeat);
          reply.raw.end();
          return;
        }

        writeSse(reply, { type: 'done', worldbookXml: wbXml, worldbookJson }, 'done');
        clearInterval(heartbeat);
        reply.raw.end();
        return;
      }

      const assistantText = await callChatCompletions({
        apiBaseUrl,
        apiKey,
        model,
        temperature,
        maxTokens,
        messages,
      });

      const wbXml = extractFirstTagBlock(assistantText, 'sentra-worldbook');
      if (!wbXml) {
        return reply.code(502).send({
          error: 'Invalid upstream response',
          message: 'Missing <sentra-worldbook> block in LLM output',
          raw: assistantText,
        });
      }

      const jsonText = extractWorldbookPayloadText(wbXml);
      let worldbookJson: any;
      try {
        worldbookJson = JSON.parse(jsonText);
      } catch (e: any) {
        return reply.code(502).send({
          error: 'Invalid upstream response',
          message: e?.message || 'Failed to parse worldbook JSON',
          worldbookXml: wbXml,
        });
      }

      return { worldbookXml: wbXml, worldbookJson };
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to generate worldbook',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
