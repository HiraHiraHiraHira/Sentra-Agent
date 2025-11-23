import { FastifyInstance } from 'fastify';
import { join, resolve, basename, relative } from 'path';
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync } from 'fs';

// Helper to get root directory
function getRootDir(): string {
    return resolve(process.cwd(), process.env.SENTRA_ROOT || '..');
}

// Helper to get presets directory
function getPresetsDir(): string {
    return join(getRootDir(), 'agent-presets');
}

export async function presetRoutes(fastify: FastifyInstance) {
    // Get list of all preset files
    fastify.get('/api/presets', async (_request, reply) => {
        try {
            const presetsDir = getPresetsDir();

            if (!existsSync(presetsDir)) {
                return []; // Return empty list if directory doesn't exist
            }

            // Recursive scan function
            const scanDir = (dir: string, baseDir: string): any[] => {
                const items = readdirSync(dir);
                let results: any[] = [];

                for (const item of items) {
                    const fullPath = join(dir, item);
                    const stat = statSync(fullPath);
                    const relativePath = relative(baseDir, fullPath).replace(/\\/g, '/');

                    if (stat.isDirectory()) {
                        results = results.concat(scanDir(fullPath, baseDir));
                    } else {
                        results.push({
                            path: relativePath,
                            name: basename(fullPath),
                            size: stat.size,
                            modified: stat.mtime.toISOString()
                        });
                    }
                }
                return results;
            };

            const files = scanDir(presetsDir, presetsDir);
            // Sort by name
            files.sort((a, b) => a.name.localeCompare(b.name));

            return files;
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to scan presets',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Get content of a specific preset file
    fastify.get<{
        Querystring: { path: string };
    }>('/api/presets/file', async (request, reply) => {
        try {
            const { path } = request.query;

            if (!path) {
                return reply.code(400).send({ error: 'Missing file path' });
            }

            // Security check: prevent directory traversal
            if (path.includes('..')) {
                return reply.code(400).send({ error: 'Invalid file path' });
            }

            const presetsDir = getPresetsDir();
            const fullPath = join(presetsDir, path);

            if (!existsSync(fullPath)) {
                return reply.code(404).send({ error: 'File not found' });
            }

            const content = readFileSync(fullPath, 'utf-8');
            return { content };
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to read file',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Save content to a specific preset file
    fastify.post<{
        Body: { path: string; content: string };
    }>('/api/presets/file', async (request, reply) => {
        try {
            const { path, content } = request.body;

            if (!path) {
                return reply.code(400).send({ error: 'Missing file path' });
            }

            // Security check: prevent directory traversal
            if (path.includes('..')) {
                return reply.code(400).send({ error: 'Invalid file path' });
            }

            const presetsDir = getPresetsDir();
            const fullPath = join(presetsDir, path);

            // Ensure directory exists if it's a new file in a subdirectory
            // (Though for now we might only support editing existing files or root files)

            if (!existsSync(fullPath)) {
                // Ensure parent directory exists
                const parentDir = fullPath.substring(0, fullPath.lastIndexOf(path.includes('/') ? '/' : '\\'));
                if (parentDir && !existsSync(parentDir)) {
                    // We need to import mkdirSync
                    // But wait, let's just use a helper or simple logic
                    // Actually, let's import mkdirSync at the top
                }
            }

            // Better approach: always ensure parent dir exists
            const { dirname } = await import('path');
            const { mkdirSync } = await import('fs');
            const parentDir = dirname(fullPath);
            if (!existsSync(parentDir)) {
                mkdirSync(parentDir, { recursive: true });
            }

            writeFileSync(fullPath, content, 'utf-8');

            return { success: true, message: `File saved: ${path}` };
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to save file',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Delete a specific preset file
    fastify.delete<{
        Querystring: { path: string };
    }>('/api/presets/file', async (request, reply) => {
        try {
            const { path } = request.query;

            if (!path) {
                return reply.code(400).send({ error: 'Missing file path' });
            }

            // Security check: prevent directory traversal
            if (path.includes('..')) {
                return reply.code(400).send({ error: 'Invalid file path' });
            }

            const presetsDir = getPresetsDir();
            const fullPath = join(presetsDir, path);

            if (!existsSync(fullPath)) {
                return reply.code(404).send({ error: 'File not found' });
            }

            // Additional security: ensure it's a file, not a directory
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                return reply.code(400).send({ error: 'Cannot delete directories' });
            }

            // Delete the file
            const { unlinkSync } = await import('fs');
            unlinkSync(fullPath);

            return { success: true, message: `File deleted: ${path}` };
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to delete file',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });
}
