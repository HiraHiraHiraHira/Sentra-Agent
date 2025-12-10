import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../../src/logger/index.js';
import { config } from '../../src/config/index.js';
import OpenAI from 'openai';
import mime from 'mime-types';
import { httpRequest } from '../../src/utils/http.js';

// 模型简化：仅使用环境变量 DRAW_MODEL（未配置则回退全局模型）

function hasMarkdownImage(s) {
  return /!\[[^\]]*\]\([^)]+\)/i.test(String(s || ''));
}

function isHttpUrl(s) {
  try { const u = new URL(String(s)); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

function formatLocalMarkdownImage(target, alt = 'image') {
  const normalized = String(target || '').replace(/\\/g, '/');
  return `![${alt}](${normalized})`;
}

function collectLocalMarkdownImages(md) {
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const lines = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    const alt = m[1] || '';
    const url = String(m[2] || '').trim();
    if (!url) continue;
    if (isHttpUrl(url)) continue;
    if (/^data:/i.test(url)) continue;
    lines.push(formatLocalMarkdownImage(url, alt));
  }
  return lines.join('\n');
}

async function downloadImagesAndRewrite(md, prefix = 'draw') {
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const urls = new Set();
  const dataUrls = new Set();
  let m;
  while ((m = re.exec(md)) !== null) {
    const target = String(m[2] || '').trim();
    if (!target) continue;
    if (isHttpUrl(target)) urls.add(target);
    else if (/^data:image\//i.test(target)) dataUrls.add(target);
  }
  if (urls.size === 0 && dataUrls.size === 0) return md;

  const baseDir = 'artifacts';
  await fs.mkdir(baseDir, { recursive: true });

  const map = new Map();
  const dataMap = new Map();
  let idx = 0;

  // 下载 HTTP 图片
  for (const url of urls) {
    try {
      const res = await httpRequest({
        method: 'GET',
        url,
        timeoutMs: 60000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(res.data);
      let ct = (res.headers?.['content-type'] || '').split(';')[0].trim();
      if (!ct) {
        try { const u = new URL(url); ct = String(mime.lookup(u.pathname) || ''); } catch {}
      }
      let ext = '';
      if (ct && ct.startsWith('image/')) {
        const e = mime.extension(ct);
        if (e) ext = `.${e}`;
      }
      if (!ext) {
        try { const u = new URL(url); ext = path.extname(u.pathname) || '.png'; } catch { ext = '.png'; }
      }
      const name = `${prefix}_${Date.now()}_${idx++}${ext}`;
      const abs = path.resolve(baseDir, name);
      await fs.writeFile(abs, buf);
      const absMd = String(abs).replace(/\\/g, '/');
      map.set(url, absMd);
    } catch (e) {
      logger.warn?.('image_draw:download_failed', { label: 'PLUGIN', url, error: String(e?.message || e) });
    }
  }

  // 处理 data:image/...;base64,...
  for (const dataUrl of dataUrls) {
    try {
      const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/i);
      if (!match) continue;
      const mimeType = (match[1] || '').trim() || 'image/png';
      const b64 = String(match[2] || '').trim().replace(/\s+/g, '');
      if (!b64) continue;
      const buf = Buffer.from(b64, 'base64');
      let ext = '';
      if (mimeType && mimeType.toLowerCase().startsWith('image/')) {
        const e = mime.extension(mimeType);
        if (e) ext = `.${e}`;
      }
      if (!ext) ext = '.png';
      const name = `${prefix}_${Date.now()}_${idx++}${ext}`;
      const abs = path.resolve(baseDir, name);
      await fs.writeFile(abs, buf);
      const absMd = String(abs).replace(/\\/g, '/');
      dataMap.set(dataUrl, absMd);
    } catch (e) {
      logger.warn?.('image_draw:decode_base64_failed', { label: 'PLUGIN', error: String(e?.message || e) });
    }
  }

  return md.replace(re, (full, alt, url) => {
    const key = String(url || '').trim();
    if (map.has(key)) return `![${alt}](${map.get(key)})`;
    if (dataMap.has(key)) return `![${alt}](${dataMap.get(key)})`;
    return full;
  });
}

export default async function handler(args = {}, options = {}) {
  const prompt = String(args.prompt || '').trim();
  if (!prompt) return { success: false, code: 'INVALID', error: 'prompt is required' };

  const penv = options?.pluginEnv || {};
  const apiKey = penv.DRAW_API_KEY || process.env.DRAW_API_KEY || config.llm.apiKey;
  const baseURL = penv.DRAW_BASE_URL || process.env.DRAW_BASE_URL || config.llm.baseURL;
  const model = String(penv.DRAW_MODEL || process.env.DRAW_MODEL || config.llm.model || '').trim();
   const mode = String(penv.DRAW_MODE || process.env.DRAW_MODE || 'chat').toLowerCase();
   const imageSize = String(penv.DRAW_IMAGE_SIZE || process.env.DRAW_IMAGE_SIZE || '1024x1024');

  const oai = new OpenAI({ apiKey, baseURL });

  // 模式一：直接调用 /v1/images/generations
  if (mode === 'images') {
    try {
      const baseDir = 'artifacts';
      await fs.mkdir(baseDir, { recursive: true });

      const res = await oai.images.generate({
        model: model || undefined,
        prompt,
        n: 1,
        size: imageSize,
        response_format: 'b64_json'
      });

      const first = Array.isArray(res?.data) ? res.data[0] : null;
      const b64 = first?.b64_json;
      if (!b64) {
        return { success: false, code: 'NO_IMAGE', error: 'images API returned no image data', data: { prompt } };
      }

      const buf = Buffer.from(String(b64), 'base64');
      const name = `draw_${Date.now()}_0.png`;
      const abs = path.resolve(baseDir, name);
      await fs.writeFile(abs, buf);
      const absMd = String(abs).replace(/\\/g, '/');
      const content = formatLocalMarkdownImage(absMd);

      return { success: true, data: { prompt, content } };
    } catch (e) {
      logger.warn?.('image_draw:images_request_failed', { label: 'PLUGIN', error: String(e?.message || e) });
      return { success: false, code: 'ERR', error: String(e?.message || e) };
    }
  }

  // 模式二：chat.completions，流式接收 Markdown 图片链接（可能为 URL 或 base64）
  const system = 'You are an image drawing assistant. Respond with a short description plus at least one Markdown image link (e.g., ![image](...)). Do not include code fences.';
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt }
  ];

  try {
    const stream = await oai.chat.completions.create({ model, messages, stream: true });
    let content = '';
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content || '';
      if (delta) {
        content += delta;
        if (typeof options?.onStream === 'function') {
          try {
            options.onStream({ type: 'delta', delta, content });
          } catch {}
        }
      }
    }

    if (!hasMarkdownImage(content)) {
      return { success: false, code: 'NO_MD_IMAGE', error: 'response has no markdown image', data: { prompt } };
    }
    const rewritten = await downloadImagesAndRewrite(content, 'draw');
    const localMarkdown = collectLocalMarkdownImages(rewritten);
    if (!localMarkdown) {
      return { success: false, code: 'NO_LOCAL_IMAGE', error: 'unable to download image to local markdown', data: { prompt } };
    }
    return { success: true, data: { prompt, content: localMarkdown } };
  } catch (e) {
    logger.warn?.('image_draw:request_failed', { label: 'PLUGIN', error: String(e?.message || e) });
    return { success: false, code: 'ERR', error: String(e?.message || e) };
  }
}
