import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config, reloadConfig } from '../../config/index.js';
import logger from '../../logger/index.js';
import MCPCore from '../../mcpcore/index.js';
import { Metrics } from '../../metrics/index.js';

const mcpcore = new MCPCore();

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

function startHotReloadWatchers(core) {
  const debounceMs = 500;
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

  const reloadPluginsDebounced = createDebounced(() => {
    try {
      logger.info('检测到插件 .env 变更，重新加载本地插件', { label: 'MCP' });
      core.reloadLocalPlugins().catch((e) => {
        logger.error('本地插件热重载失败', { label: 'MCP', error: String(e) });
      });
    } catch (e) {
      logger.error('调度插件热重载失败', { label: 'MCP', error: String(e) });
    }
  }, debounceMs);

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

// Some SDK versions may not export isInitializeRequest; define a minimal local predicate
function isInitialize(body) {
  return body && typeof body === 'object' && body.method === 'initialize';
}

function mapToolToSpec(t) {
  // Map MCPCore tool entry to MCP Tool schema
  return {
    name: t.aiName, // expose aiName to avoid collisions
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
    annotations: {
      scope: t.scope || 'global',
      tenant: t.tenant || 'default',
      provider: t.provider || t.providerType || 'local',
      cooldownMs: t.cooldownMs || 0,
    },
  };
}

function toCallToolResult(res) {
  if (res?.success) {
    const data = res.data ?? null;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return {
      content: [{ type: 'text', text }],
      structuredContent: res,
      isError: false,
    };
  }
  const err = res?.error || { message: 'Unknown error' };
  const msg = err.message || String(err);
  return {
    content: [{ type: 'text', text: `Error: ${msg}` }],
    structuredContent: res,
    isError: true,
  };
}

async function buildServer() {
  await mcpcore.init();

  const server = new Server(
    { name: 'sentra-mcp-server', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = mcpcore.getAvailableTools().map(mapToolToSpec);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request?.params?.name;
    const args = request?.params?.arguments ?? {};
    if (!name) throw new Error('Missing tool name');
    const result = await mcpcore.callByAIName(name, args, { source: 'mcp' });
    return toCallToolResult(result);
  });

  return server;
}

async function startstdio() {
  const server = await buildServer();
  const transport = new StdioServerTransport();
  logger.info('Starting MCP server on stdio');
  await server.connect(transport);
}

async function starthttp() {
  // Dynamic import to avoid hard dependency on SDK versions without Streamable HTTP
  let StreamableHTTPServerTransport;
  try {
    ({ StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js'));
  } catch (e) {
    logger.error('Streamable HTTP transport not available in current SDK. Try upgrading @modelcontextprotocol/sdk or set MCP_SERVER_TRANSPORT=stdio.', { error: String(e) });
    process.exit(1);
  }
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['Content-Type', 'mcp-session-id'] }));

  // sessions
  const transports = {};

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitialize(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
        // enableDnsRebindingProtection: true,
        // allowedHosts: config.server.allowedHosts,
      });

      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };

      const server = await buildServer();
      await server.connect(transport);
    } else {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID provided' }, id: null });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const handleSessionRequest = async (req, res) => {
    const sid = req.headers['mcp-session-id'];
    if (!sid || !transports[sid]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sid].handleRequest(req, res);
  };

  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  // Optional metrics endpoints (not part of MCP spec)
  app.get('/metrics/summary', async (req, res) => {
    try {
      const tool = String(req.query.tool || 'echo');
      const provider = String(req.query.provider || 'local');
      const s = await Metrics.getSummary(tool, provider);
      res.json({ success: true, data: s });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e) });
    }
  });

  const port = config.server.httpPort;
  app.listen(port, () => logger.info(`MCP server (Streamable HTTP) listening on :${port}`));
}

if (config.server.transport === 'stdio') {
  startHotReloadWatchers(mcpcore);
  startstdio().catch((e) => {
    logger.error('Failed to start stdio server', { error: String(e) });
    process.exit(1);
  });
} else if (config.server.transport === 'http') {
  startHotReloadWatchers(mcpcore);
  starthttp().catch((e) => {
    logger.error('Failed to start http server', { error: String(e) });
    process.exit(1);
  });
} else {
  logger.error('Unknown MCP_SERVER_TRANSPORT, expected stdio|http', { transport: config.server.transport });
  process.exit(1);
}
