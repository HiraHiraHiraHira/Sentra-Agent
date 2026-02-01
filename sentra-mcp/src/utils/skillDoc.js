import fs from 'node:fs';
import path from 'node:path';

function stripBom(s) {
  if (!s) return '';
  const str = String(s);
  return str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str;
}

/**
 * Parse skill Markdown.
 *
 * NOTE: We intentionally do NOT support YAML frontmatter anymore.
 * skill.md should be plain Markdown.
 * Returns { attributes: object, body: string, raw: string }
 */
export function parseSkillMarkdown(raw) {
  const text = stripBom(String(raw ?? ''));
  return { attributes: {}, body: text, raw: text };
}

export function buildSkillDigest({ attributes = {}, body = '' } = {}) {
  const lines = [];
  void attributes;

  const bodyText = String(body || '').trim();
  if (!bodyText) return '';

  lines.push(bodyText);
  return lines.join('\n').trim();
}

function safeReadFileSync(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

export function readSkillDocFromPluginDir(pluginAbsDir) {
  const abs = String(pluginAbsDir || '');
  if (!abs) return null;
  const skillPath = path.join(abs, 'skill.md');
  const raw = safeReadFileSync(skillPath);
  if (!raw) return null;
  const parsed = parseSkillMarkdown(raw);
  const digest = buildSkillDigest(parsed);
  return {
    path: skillPath,
    format: 'md',
    raw: parsed.raw,
    attributes: parsed.attributes,
    body: parsed.body,
    digest,
    updatedAt: (() => {
      try {
        const st = fs.statSync(skillPath);
        return st.mtimeMs;
      } catch {
        return Date.now();
      }
    })(),
  };
}

export function toXmlCData(text) {
  const s = String(text ?? '');
  return s.replace(/]]>/g, ']]]]><![CDATA[>');
}
