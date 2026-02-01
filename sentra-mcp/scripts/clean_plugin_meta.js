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
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
}

function isPlainObject(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function cleanMeta(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;

  if (!('meta' in cfg)) return false;

  const meta = cfg.meta;

  if (!isPlainObject(meta)) {
    delete cfg.meta;
    return true;
  }

  const keysToDelete = [
    'realWorldAction',
    'responseStyle',
    'responseExample',
    'real_world_action',
    'response_style',
    'response_examples',
  ];

  let changed = false;
  for (const k of keysToDelete) {
    if (k in meta) {
      delete meta[k];
      changed = true;
    }
  }

  if (Object.keys(meta).length === 0) {
    delete cfg.meta;
    changed = true;
  }

  return changed;
}

async function main() {
  const argv = process.argv.slice(2);

  const pluginsRoot = getArgValue(argv, '--plugins', path.resolve(process.cwd(), 'plugins'));
  const write = hasFlag(argv, '--write');
  const backup = hasFlag(argv, '--backup');

  const entries = await fs.readdir(pluginsRoot, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const touched = [];
  let scanned = 0;
  let changed = 0;
  let written = 0;
  let backedUp = 0;
  let parseFailed = 0;

  for (const dir of dirs) {
    const pluginDir = path.join(pluginsRoot, dir);
    const cfgPath = path.join(pluginDir, 'config.json');
    if (!fssync.existsSync(cfgPath)) continue;

    scanned += 1;

    const raw = await fs.readFile(cfgPath, 'utf-8');
    const cfg = safeJsonParse(raw);
    if (!cfg) {
      parseFailed += 1;
      continue;
    }

    const didChange = cleanMeta(cfg);
    if (!didChange) continue;

    changed += 1;
    touched.push(cfgPath);

    if (write) {
      if (backup) {
        const bakPath = cfgPath + '.bak';
        if (!fssync.existsSync(bakPath)) {
          await fs.copyFile(cfgPath, bakPath);
          backedUp += 1;
        }
      }
      await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
      written += 1;
    }
  }

  const result = {
    pluginsRoot,
    mode: write ? 'write' : 'dry-run',
    backup,
    scanned,
    parseFailed,
    changed,
    written,
    backedUp,
    touched,
  };

  process.stdout.write(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e));
  process.exit(1);
});
