import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载 prompts 目录下的 JSON 提示文件，例如 loadPrompt('persona_initial') 对应 persona_initial.json
export async function loadPrompt(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('loadPrompt: name is required');
  }
  const filePath = path.resolve(__dirname, `${name}.json`);
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

// 简单模板渲染，将 {{key}} 替换为 vars[key]
export function renderTemplate(str, vars = {}) {
  return String(str ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : '';
  });
}

// 合成最终 system 提示：先 overlay，再 base
export function composeSystem(base, overlay) {
  const b = String(base ?? '');
  const o = overlay ? String(overlay) : '';
  return o ? `${o}\n\n${b}` : b;
}
