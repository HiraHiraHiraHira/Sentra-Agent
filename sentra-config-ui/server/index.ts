import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { configRoutes } from './routes/config';
import { scriptRoutes } from './routes/scripts';
import { join } from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const PORT = parseInt(process.env.SERVER_PORT || '7245');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

async function start() {
  const fastify = Fastify({
    logger: true,
  });

  // 注册 CORS
  await fastify.register(cors, {
    origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  });

  // 注册路由
  await fastify.register(configRoutes);
  await fastify.register(scriptRoutes);

  // 生产环境提供静态文件
  if (process.env.NODE_ENV === 'production') {
    const distPath = join(process.cwd(), 'dist');
    if (existsSync(distPath)) {
      await fastify.register(fastifyStatic, {
        root: distPath,
        prefix: '/',
      });

      fastify.setNotFoundHandler((request, reply) => {
        if (!request.url.startsWith('/api')) {
          reply.sendFile('index.html');
        } else {
          reply.code(404).send({ error: 'Not found' });
        }
      });
    }
  }

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`\nSentra Config Webui Server running at:`);
    console.log(`   - Local:   http://localhost:${PORT}`);
    console.log(`   - Network: http://0.0.0.0:${PORT}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
