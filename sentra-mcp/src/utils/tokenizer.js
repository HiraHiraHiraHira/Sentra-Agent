import { get_encoding, encoding_for_model } from 'tiktoken';

const _encCache = new Map();

function getEncoder(model) {
  const key = String(model || '').trim() || '__default__';
  const cached = _encCache.get(key);
  if (cached) return cached;

  let enc;
  if (key === '__default__' || key === 'cl100k_base') {
    enc = get_encoding('cl100k_base');
  } else {
    enc = encoding_for_model(key);
  }

  _encCache.set(key, enc);
  return enc;
}

export function countTokens(text, opts = {}) {
  const s = String(text ?? '');
  const model = opts?.model;
  const enc = getEncoder(model);
  return enc.encode(s).length;
}

export function fitToTokenLimit(text, opts = {}) {
  const s = String(text ?? '');
  const maxTokens = Number(opts?.maxTokens);
  const model = opts?.model;

  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    return {
      text: s,
      tokens: countTokens(s, { model }),
      truncated: false,
    };
  }

  let total = countTokens(s, { model });
  if (total <= maxTokens) {
    return { text: s, tokens: total, truncated: false };
  }

  let low = 0;
  let high = s.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const cand = s.slice(0, mid);
    const t = countTokens(cand, { model });
    if (t <= maxTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const out = s.slice(0, Math.max(0, low));
  total = countTokens(out, { model });

  return {
    text: out,
    tokens: total,
    truncated: out.length !== s.length,
  };
}
