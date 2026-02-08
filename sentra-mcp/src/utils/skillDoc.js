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

export function buildDefaultSkillMarkdown({ toolName = '' } = {}) {
  const name = String(toolName || '').trim() || 'plugin';
  return `# ${name}

## Capability

- Describe what this tool can do in one sentence.

## Real-world impact

- Unknown/depends on implementation; be conservative and verify inputs carefully.

## Typical scenarios

- Use when the user explicitly requests this capability and the required inputs can be extracted from context or asked via a follow-up question.

## Non-goals

- Do not use when inputs are missing and cannot be reliably inferred. Ask a follow-up question instead.
- Do not fabricate IDs, paths, URLs, tokens, or example values.

## Input

- Required fields:
  - See tool schema

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
`;
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
  const skillExamplePath = path.join(abs, 'skill.example.md');
  const rawSkill = safeReadFileSync(skillPath);
  const rawExample = rawSkill ? null : safeReadFileSync(skillExamplePath);

  const toolName = (() => {
    try {
      return path.basename(abs);
    } catch {
      return '';
    }
  })();

  const rawText = rawSkill || rawExample || buildDefaultSkillMarkdown({ toolName });
  const parsed = parseSkillMarkdown(rawText);
  const sourcePath = rawSkill ? skillPath : (rawExample ? skillExamplePath : skillPath);
  const defaultSource = rawSkill ? undefined : (rawExample ? 'example' : 'generated');
  return {
    path: sourcePath,
    format: 'md',
    raw: parsed.raw,
    attributes: parsed.attributes,
    body: parsed.body,
    updatedAt: (() => {
      try {
        if (rawSkill) {
          const st = fs.statSync(skillPath);
          return st.mtimeMs;
        }
        if (rawExample) {
          const st = fs.statSync(skillExamplePath);
          return st.mtimeMs;
        }
        return 0;
      } catch {
        return 0;
      }
    })(),
    isDefault: !rawSkill,
    defaultSource,
  };
}

export function toXmlCData(text) {
  const s = String(text ?? '');
  return s.replace(/]]>/g, ']]]]><![CDATA[>');
}
