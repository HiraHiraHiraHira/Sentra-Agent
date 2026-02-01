import fs from 'node:fs/promises';
import path from 'node:path';
import { SentraMcpSDK } from '../src/sdk/index.js';

function getArgValue(argv, key, fallback = '') {
  const idx = argv.indexOf(key);
  if (idx >= 0 && idx + 1 < argv.length) return String(argv[idx + 1] || '');
  return fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  const outDir = getArgValue(argv, '--outDir', path.resolve(process.cwd(), 'artifacts'));
  const format = (getArgValue(argv, '--format', 'both') || 'both').toLowerCase();

  await fs.mkdir(outDir, { recursive: true });

  const sdk = new SentraMcpSDK();
  await sdk.init();

  const outputs = [];

  if (format === 'md' || format === 'markdown' || format === 'both') {
    const mdRes = await sdk.exportTools({ format: 'md' });
    const md = typeof mdRes === 'string' ? mdRes : (mdRes && typeof mdRes.content === 'string' ? mdRes.content : String(mdRes));
    const p = path.join(outDir, 'tools.md');
    await fs.writeFile(p, md, 'utf-8');
    outputs.push(p);
  }

  if (format === 'xml' || format === 'both') {
    const xmlRes = await sdk.exportTools({ format: 'xml' });
    const xml = typeof xmlRes === 'string' ? xmlRes : (xmlRes && typeof xmlRes.content === 'string' ? xmlRes.content : String(xmlRes));
    const p = path.join(outDir, 'tools.xml');
    await fs.writeFile(p, xml, 'utf-8');
    outputs.push(p);
  }

  if (format === 'json' || format === 'both') {
    const jsonRes = await sdk.exportTools({ format: 'json' });
    const json = typeof jsonRes === 'string' ? jsonRes : (jsonRes && typeof jsonRes.content === 'string' ? jsonRes.content : String(jsonRes));
    const p = path.join(outDir, 'tools.json');
    await fs.writeFile(p, json, 'utf-8');
    outputs.push(p);
  }

  process.stdout.write(JSON.stringify({ outDir, format, outputs }, null, 2));
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e));
  process.exit(1);
});
