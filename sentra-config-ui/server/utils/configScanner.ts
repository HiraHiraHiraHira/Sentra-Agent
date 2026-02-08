import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { ModuleConfig, PluginConfig, ConfigData, EnvVariable } from '../types';
import { readEnvFile, mergeEnvWithExample } from './envParser';

function stripBom(s: string): string {
  if (!s) return '';
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function buildDefaultSkillMarkdown(toolName: string): string {
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

// Resolve root directory dynamically at runtime so env can override
function getRootDir(): string {
  return resolve(process.cwd(), process.env.SENTRA_ROOT || '..');
}

// 要扫描的模块目录
const MODULES = [
  '.', // 根目录 .env / .env.example
  'sentra-config-ui', // 本项目配置（客户端/服务端端口、CORS等）
  'sentra-prompts',
  'sentra-mcp',
  'sentra-rag',
  'sentra-emo',
  'sentra-adapter/napcat',
  'utils/emoji-stickers', // 表情包配置 .env / .env.example
];

/**
 * 扫描单个模块的配置
 */
function scanModule(moduleName: string): ModuleConfig {
  const modulePath = join(getRootDir(), moduleName);
  const envPath = join(modulePath, '.env');
  const examplePath = join(modulePath, '.env.example');

  const hasEnv = existsSync(envPath);
  const hasExample = existsSync(examplePath);

  // 如果没有 .env 但有 .env.example，则使用 example 作为预览
  // 如果没有 .env 但有 .env.example，则使用 example 作为预览
  // 如果两者都有，则合并：使用 .env 的值，但补全 example 的 key 和注释
  let variables: EnvVariable[] = [];
  if (hasEnv) {
    const envVars = readEnvFile(envPath);
    if (hasExample) {
      const exampleVars = readEnvFile(examplePath);
      variables = mergeEnvWithExample(envVars, exampleVars);
    } else {
      variables = envVars;
    }
  } else if (hasExample) {
    variables = readEnvFile(examplePath);
  }

  const exampleVariables = hasExample ? readEnvFile(examplePath) : undefined;

  return {
    name: moduleName,
    path: modulePath,
    hasEnv,
    hasExample,
    variables,
    exampleVariables,
  };
}

/**
 * 扫描插件目录
 */
function scanPlugins(): PluginConfig[] {
  const pluginsDir = join(getRootDir(), 'sentra-mcp', 'plugins');
  if (!existsSync(pluginsDir)) {
    return [];
  }

  const plugins: PluginConfig[] = [];
  const entries = readdirSync(pluginsDir);

  for (const entry of entries) {
    const pluginPath = join(pluginsDir, entry);

    // 跳过文件，只处理目录
    if (!statSync(pluginPath).isDirectory()) {
      continue;
    }

    const envPath = join(pluginPath, '.env');
    const examplePath = join(pluginPath, '.env.example');
    const configPath = join(pluginPath, 'config.json');
    const skillPath = join(pluginPath, 'skill.md');
    const skillExamplePath = join(pluginPath, 'skill.example.md');

    const hasEnv = existsSync(envPath);
    const hasExample = existsSync(examplePath);
    const hasConfigJson = existsSync(configPath);
    const hasSkill = existsSync(skillPath);
    const hasSkillExample = existsSync(skillExamplePath);

    // 如果没有 .env 但有 .env.example，则使用 example 作为预览
    // 如果没有 .env 但有 .env.example，则使用 example 作为预览
    // 如果两者都有，则合并
    let variables: EnvVariable[] = [];
    if (hasEnv) {
      const envVars = readEnvFile(envPath);
      if (hasExample) {
        const exampleVars = readEnvFile(examplePath);
        variables = mergeEnvWithExample(envVars, exampleVars);
      } else {
        variables = envVars;
      }
    } else if (hasExample) {
      variables = readEnvFile(examplePath);
    }

    const exampleVariables = hasExample ? readEnvFile(examplePath) : undefined;

    let configJson = undefined;
    if (hasConfigJson) {
      try {
        const configContent = readFileSync(configPath, 'utf-8');
        configJson = JSON.parse(configContent);
      } catch (error) {
        console.error(`Failed to parse config.json for plugin ${entry}: `, error);
      }
    }

    let skillMarkdown: string | undefined;
    let skillIsDefault: boolean | undefined;
    let skillDefaultSource: 'example' | 'generated' | undefined;
    try {
      if (hasSkill) {
        skillMarkdown = stripBom(readFileSync(skillPath, 'utf-8'));
        skillIsDefault = false;
        skillDefaultSource = undefined;
      } else if (hasSkillExample) {
        skillMarkdown = stripBom(readFileSync(skillExamplePath, 'utf-8'));
        skillIsDefault = true;
        skillDefaultSource = 'example';
      } else {
        skillMarkdown = buildDefaultSkillMarkdown(entry);
        skillIsDefault = true;
        skillDefaultSource = 'generated';
      }
    } catch {
      if (hasSkill) {
        skillMarkdown = buildDefaultSkillMarkdown(entry);
        skillIsDefault = true;
        skillDefaultSource = 'generated';
      } else if (hasSkillExample) {
        try {
          skillMarkdown = stripBom(readFileSync(skillExamplePath, 'utf-8'));
          skillIsDefault = true;
          skillDefaultSource = 'example';
        } catch {
          skillMarkdown = buildDefaultSkillMarkdown(entry);
          skillIsDefault = true;
          skillDefaultSource = 'generated';
        }
      } else {
        skillMarkdown = buildDefaultSkillMarkdown(entry);
        skillIsDefault = true;
        skillDefaultSource = 'generated';
      }
    }

    plugins.push({
      name: entry,
      path: pluginPath,
      hasEnv,
      hasExample,
      hasConfigJson,
      hasSkill,
      hasSkillExample,
      variables,
      exampleVariables,
      configJson,
      skillMarkdown,
      skillIsDefault,
      skillDefaultSource,
    });
  }

  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 扫描所有配置
 */
export function scanAllConfigs(): ConfigData {
  const modules = MODULES.map(scanModule);
  const plugins = scanPlugins();

  return {
    modules,
    plugins,
  };
}
