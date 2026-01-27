import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reloadConfig } from './index.js';
import logger from '../logger/index.js';

let started = false;

function createDebounced(fn, delayMs) {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delayMs);
  };
}

/**
 * 启动根 .env 和插件目录 .env 的热更新监控。
 * 可以在 MCP server 或 SDK 场景下复用。
 * @param {import('../mcpcore/index.js').default} [core] - 可选 MCPCore 实例，用于在插件 .env 变更时触发 reloadLocalPlugins()
 */
export function startHotReloadWatchers(core) {
  if (started) return;
  started = true;

  const debounceMs = Number(process.env.MCP_HOT_RELOAD_DEBOUNCE_MS || 500);
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const mcpRootDir = path.resolve(__dirname, '../..');
  const envPath = path.join(mcpRootDir, '.env');
  const pluginsDir = path.join(mcpRootDir, 'plugins');

  const reloadConfigDebounced = createDebounced(() => {
    try {
      logger.info('检测到根 .env 变更，重新加载配置', { label: 'MCP' });
      reloadConfig();
    } catch (e) {
      logger.error('重新加载配置失败', { label: 'MCP', error: String(e) });
    }
  }, debounceMs);

  const changedPluginDirs = new Set();
  const reloadPluginsDebounced = createDebounced(() => {
    if (!core || typeof core.reloadPluginEnvs !== 'function') return;
    try {
      const dirs = Array.from(changedPluginDirs);
      changedPluginDirs.clear();
      logger.info('检测到插件 .env 变更，刷新插件环境变量', { label: 'MCP', count: dirs.length });
      core.reloadPluginEnvs(dirs).catch((e) => {
        logger.error('插件 env 热更新失败', { label: 'MCP', error: String(e) });
      });
    } catch (e) {
      logger.error('调度插件 env 热更新失败', { label: 'MCP', error: String(e) });
    }
  }, debounceMs);

  // 根 .env 监控
  try {
    if (fs.existsSync(envPath)) {
      fs.watch(envPath, { persistent: false }, () => {
        reloadConfigDebounced();
      });
      logger.info('已开启根 .env 热更新监控', { label: 'MCP', envPath });
    }
  } catch (e) {
    logger.warn('根 .env 监控失败（将不支持自动热更新）', { label: 'MCP', error: String(e) });
  }

  // 插件 .env 监控（仅在存在 plugins 目录时启用）
  try {
    if (fs.existsSync(pluginsDir)) {
      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const pluginDir = path.join(pluginsDir, ent.name);
        try {
          fs.watch(pluginDir, { persistent: false }, (_eventType, filename) => {
            if (!filename) return;
            if (filename === '.env' || filename === 'config.env') {
              changedPluginDirs.add(ent.name);
              reloadPluginsDebounced();
            }
          });
        } catch (e) {
          logger.warn('插件目录监控失败', { label: 'MCP', dir: pluginDir, error: String(e) });
        }
      }
      logger.info('已开启插件 .env 热更新监控', { label: 'MCP', pluginsDir });
    }
  } catch (e) {
    logger.warn('插件根目录监控失败（将不支持插件热更新）', { label: 'MCP', dir: pluginsDir, error: String(e) });
  }
}
