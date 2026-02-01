import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function getArgValue(argv, key, fallback = '') {
  const idx = argv.indexOf(key);
  if (idx >= 0 && idx + 1 < argv.length) return String(argv[idx + 1] || '');
  return fallback;
}

function safeJsonParse(s) {
  try { return JSON.parse(String(s)); } catch { return null; }
}

function extractRequiredGroups(schema = {}) {
  try {
    const groups = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.required) && node.required.length) {
        groups.push(node.required.map(String));
      }
      const variants = [];
      if (Array.isArray(node.anyOf)) variants.push(...node.anyOf);
      if (Array.isArray(node.oneOf)) variants.push(...node.oneOf);
      if (Array.isArray(node.allOf)) variants.push(...node.allOf);
      for (const v of variants) visit(v);
    };
    visit(schema);
    const seen = new Set();
    const uniq = [];
    for (const g of groups) {
      const key = JSON.stringify(g.slice().sort());
      if (!seen.has(key)) { seen.add(key); uniq.push(g); }
    }
    return uniq;
  } catch {
    return [];
  }
}

function inferRiskLevel(name, desc = '') {
  const n = String(name || '').toLowerCase();
  const d = String(desc || '').toLowerCase();

  const text = `${n} ${d}`;

  if (text.includes('write') || text.includes('save') || text.includes('download') || text.includes('render') || text.includes('generate') || text.includes('file') || text.includes('pdf') || text.includes('docx') || text.includes('xlsx') || text.includes('ppt')) {
    return 'writes_local';
  }
  if (text.includes('send') || text.includes('kick') || text.includes('ban') || text.includes('set') || text.includes('delete') || text.includes('recall') || text.includes('avatar') || text.includes('profile')) {
    return 'real_world_action';
  }
  if (text.includes('search') || text.includes('read') || text.includes('info') || text.includes('get') || text.includes('vision') || text.includes('weather')) {
    return 'read_only';
  }
  return 'unknown';
}

function buildEnglishBody({ name, description, schema }) {
  const desc = String(description || '').trim();
  const req = Array.isArray(schema?.required) ? schema.required.map(String) : [];
  const groups = extractRequiredGroups(schema || {});
  const baseKey = JSON.stringify(req.slice().sort());
  const conditionalGroups = groups
    .map((g) => ({ g, key: JSON.stringify(g.slice().sort()) }))
    .filter((x) => x.g.length && x.key !== baseKey)
    .map((x) => x.g);
  const risk = inferRiskLevel(name, description);

  const lines = [];
  lines.push(`# ${name}`);
  lines.push('');
  lines.push('## Capability');
  lines.push('');
  lines.push(`- ${desc || 'Describe what this tool can do in real-world terms.'}`);
  lines.push('');

  lines.push('## Real-world impact');
  lines.push('');
  if (risk === 'writes_local') {
    lines.push('- Writes local files (ensure returned paths are absolute).');
  } else if (risk === 'real_world_action') {
    lines.push('- Performs external/system actions (ensure user intent and target are explicit).');
  } else if (risk === 'read_only') {
    lines.push('- Read-only: does not modify local files or external systems.');
  } else {
    lines.push('- Unknown/depends on implementation; be conservative and verify inputs carefully.');
  }
  lines.push('');

  lines.push('## Typical scenarios');
  lines.push('');
  lines.push('- Use when the user explicitly requests this capability and the required inputs can be extracted from context or asked via a follow-up question.');
  lines.push('');

  lines.push('## Non-goals');
  lines.push('');
  lines.push('- Do not use when inputs are missing and cannot be reliably inferred. Ask a follow-up question instead.');
  lines.push('- Do not fabricate IDs, paths, URLs, tokens, or example values.');
  lines.push('');

  lines.push('## Input');
  lines.push('');
  if (req.length) {
    lines.push('- Required fields:');
    for (const r of req) lines.push(`  - \`${r}\``);
    lines.push('');
  }
  if (conditionalGroups.length) {
    lines.push('- Conditional required (anyOf/oneOf): satisfy at least one group:');
    for (const g of conditionalGroups) lines.push(`  - [${g.join(', ')}]`);
    lines.push('');
  }
  lines.push('- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).');
  lines.push('- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.');
  lines.push('');

  lines.push('## Output');
  lines.push('');
  lines.push('- The tool returns structured data. If it produces local files, paths must be absolute paths.');
  lines.push('');

  lines.push('## Failure modes');
  lines.push('');
  lines.push('- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const overwrite = hasFlag(argv, '--overwrite');
  const pluginsRoot = getArgValue(argv, '--plugins', path.resolve(process.cwd(), 'plugins'));

  const entries = await fs.readdir(pluginsRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const dir of dirs) {
    const abs = path.join(pluginsRoot, dir);
    const cfgPath = path.join(abs, 'config.json');
    if (!fssync.existsSync(cfgPath)) continue;

    const rawCfg = await fs.readFile(cfgPath, 'utf-8');
    const cfg = safeJsonParse(rawCfg) || {};

    const name = String(cfg.name || dir);
    const description = String(cfg.description || '').trim();
    const schema = cfg.inputSchema && typeof cfg.inputSchema === 'object' ? cfg.inputSchema : { type: 'object', properties: {} };

    const target = path.join(abs, 'skill.md');
    const exists = fssync.existsSync(target);

    if (exists && !overwrite) {
      skipped++;
      continue;
    }

    const md = buildEnglishBody({ name, description, schema });

    await fs.writeFile(target, md, 'utf-8');
    if (exists) updated++; else created++;
  }

  process.stdout.write(JSON.stringify({ pluginsRoot, created, updated, skipped, overwrite }, null, 2));
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e));
  process.exit(1);
});
