import type { FastifyInstance } from 'fastify';

function asString(v: any) {
  return v == null ? '' : String(v);
}

function normalizeBaseUrl(url: string) {
  return asString(url).trim().replace(/\/+$/, '');
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function normalizeBaseUrlV1(url: string) {
  const u = normalizeBaseUrl(url);
  if (!u) return u;
  const lower = u.toLowerCase();
  if (lower.endsWith('/v1')) return u;
  return `${u}/v1`;
}

async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export async function llmProvidersRoutes(fastify: FastifyInstance) {
  // NOTE: still protected by global x-auth-token middleware.

  fastify.post('/api/llm-providers/test-models', async (request, reply) => {
    try {
      const body: any = request.body || {};
      const baseUrl = normalizeBaseUrl(body.baseUrl);
      const apiKey = asString(body.apiKey).trim();
      const apiKeyHeader = asString(body.apiKeyHeader || 'Authorization').trim() || 'Authorization';
      const apiKeyPrefix = asString(body.apiKeyPrefix != null ? body.apiKeyPrefix : 'Bearer ');

      if (!baseUrl) {
        reply.code(400).send({ success: false, error: 'baseUrl is required' });
        return;
      }

      if (!isHttpUrl(baseUrl)) {
        reply.code(400).send({ success: false, error: 'baseUrl must start with http:// or https://' });
        return;
      }

      const baseV1 = normalizeBaseUrlV1(baseUrl);
      const url = `${baseV1}/models`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (apiKey) {
        const prefix = apiKeyPrefix;
        const lowerToken = apiKey.toLowerCase();
        const lowerPrefix = prefix.toLowerCase();
        const tokenValue = prefix && !lowerToken.startsWith(lowerPrefix) ? `${prefix}${apiKey}` : apiKey;
        headers[apiKeyHeader] = tokenValue;
      }

      const ac = new AbortController();
      const timeoutMs = 15000;
      const timer = setTimeout(() => ac.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'GET',
          headers,
          signal: ac.signal,
        } as any);
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const text = await readTextSafe(res);
        reply.code(res.status).send({ success: false, error: text || `Upstream HTTP ${res.status}` });
        return;
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        const text = await readTextSafe(res);
        reply.code(500).send({ success: false, error: text || 'Upstream returned non-JSON response' });
        return;
      }

      const models = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
          ? data.models
          : [];

      reply.send({ models });
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Upstream request timeout' : (e?.message || String(e));
      reply.code(500).send({ success: false, error: msg });
    }
  });
}
