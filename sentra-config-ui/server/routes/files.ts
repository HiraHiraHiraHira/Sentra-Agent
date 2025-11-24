import { FastifyInstance } from 'fastify';
import { join, resolve, relative, dirname } from 'path';
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, rmSync } from 'fs';

// Helper to get root directory
function getRootDir(): string {
    return resolve(process.cwd(), process.env.SENTRA_ROOT || '..');
}

// Helper to check if path is safe (inside root)
function isSafePath(targetPath: string): boolean {
    const rootDir = getRootDir();
    const resolvedPath = resolve(rootDir, targetPath);
    return resolvedPath.startsWith(rootDir);
}

// Helper to get absolute path
function getAbsolutePath(targetPath: string): string {
    return join(getRootDir(), targetPath);
}

const IGNORED_DIRS = ['node_modules', '.git', '.cache', 'dist', 'build', 'coverage', '.idea', '.vscode'];
const IGNORED_FILES = ['.DS_Store', 'Thumbs.db'];

export async function fileRoutes(fastify: FastifyInstance) {
    // Get file tree
    fastify.get<{
        Querystring: { path?: string };
    }>('/api/files/tree', async (request, reply) => {
        try {
            const relPath = request.query.path || '';

            if (!isSafePath(relPath)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            const fullPath = getAbsolutePath(relPath);

            if (!existsSync(fullPath)) {
                return reply.code(404).send({ error: 'Path not found' });
            }

            const stat = statSync(fullPath);
            if (!stat.isDirectory()) {
                return reply.code(400).send({ error: 'Path is not a directory' });
            }

            // Recursive scan function
            const scanDir = (dir: string, baseDir: string): any[] => {
                const items = readdirSync(dir);
                let results: any[] = [];

                for (const item of items) {
                    if (IGNORED_DIRS.includes(item)) continue;
                    if (IGNORED_FILES.includes(item)) continue;

                    const fullItemPath = join(dir, item);
                    const stat = statSync(fullItemPath);
                    const relativePath = relative(baseDir, fullItemPath).replace(/\\/g, '/');

                    if (stat.isDirectory()) {
                        results.push({
                            name: item,
                            path: relativePath,
                            type: 'directory',
                            size: 0,
                            modified: stat.mtime.toISOString()
                        });
                        results = results.concat(scanDir(fullItemPath, baseDir));
                    } else {
                        results.push({
                            name: item,
                            path: relativePath,
                            type: 'file',
                            size: stat.size,
                            modified: stat.mtime.toISOString()
                        });
                    }
                }
                return results;
            };

            const result = scanDir(fullPath, fullPath);

            // Sort by path to ensure hierarchy order (optional, but helpful)
            // Actually frontend builder handles it if we have all nodes.

            return result;
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to list files',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Get file content
    fastify.get<{
        Querystring: { path: string };
    }>('/api/files/content', async (request, reply) => {
        try {
            const { path } = request.query;
            if (!path) return reply.code(400).send({ error: 'Missing path' });

            if (!isSafePath(path)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            const fullPath = getAbsolutePath(path);
            if (!existsSync(fullPath)) {
                return reply.code(404).send({ error: 'File not found' });
            }

            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                return reply.code(400).send({ error: 'Cannot read directory content' });
            }

            // Check if binary (simple check by extension)
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(path);

            if (isImage) {
                const buffer = readFileSync(fullPath);
                return {
                    content: `data:image/${path.split('.').pop()};base64,${buffer.toString('base64')}`,
                    isBinary: true
                };
            } else {
                const content = readFileSync(fullPath, 'utf-8');
                return { content, isBinary: false };
            }
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to read file',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Save file content
    fastify.post<{
        Body: { path: string; content: string };
    }>('/api/files/content', async (request, reply) => {
        try {
            const { path, content } = request.body;
            if (!path) return reply.code(400).send({ error: 'Missing path' });

            if (!isSafePath(path)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            const fullPath = getAbsolutePath(path);

            // Ensure parent dir exists
            const parentDir = dirname(fullPath);
            if (!existsSync(parentDir)) {
                mkdirSync(parentDir, { recursive: true });
            }

            writeFileSync(fullPath, content, 'utf-8');
            return { success: true };
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to save file',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Create file or directory
    fastify.post<{
        Body: { path: string; type: 'file' | 'directory' };
    }>('/api/files/create', async (request, reply) => {
        try {
            const { path, type } = request.body;
            if (!path || !type) return reply.code(400).send({ error: 'Missing parameters' });

            if (!isSafePath(path)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            const fullPath = getAbsolutePath(path);
            if (existsSync(fullPath)) {
                return reply.code(400).send({ error: 'Path already exists' });
            }

            if (type === 'directory') {
                mkdirSync(fullPath, { recursive: true });
            } else {
                // Ensure parent dir exists
                const parentDir = dirname(fullPath);
                if (!existsSync(parentDir)) {
                    mkdirSync(parentDir, { recursive: true });
                }
                writeFileSync(fullPath, '', 'utf-8');
            }

            return { success: true };
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to create item',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Rename
    fastify.post<{
        Body: { oldPath: string; newPath: string };
    }>('/api/files/rename', async (request, reply) => {
        try {
            const { oldPath, newPath } = request.body;
            if (!oldPath || !newPath) return reply.code(400).send({ error: 'Missing parameters' });

            if (!isSafePath(oldPath) || !isSafePath(newPath)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            const fullOldPath = getAbsolutePath(oldPath);
            const fullNewPath = getAbsolutePath(newPath);

            if (!existsSync(fullOldPath)) {
                return reply.code(404).send({ error: 'Source path not found' });
            }
            if (existsSync(fullNewPath)) {
                return reply.code(400).send({ error: 'Destination path already exists' });
            }

            renameSync(fullOldPath, fullNewPath);
            return { success: true };
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to rename',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });

    // Delete
    fastify.delete<{
        Querystring: { path: string };
    }>('/api/files/delete', async (request, reply) => {
        try {
            const { path } = request.query;
            if (!path) return reply.code(400).send({ error: 'Missing path' });

            if (!isSafePath(path)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            const fullPath = getAbsolutePath(path);
            if (!existsSync(fullPath)) {
                return reply.code(404).send({ error: 'Path not found' });
            }

            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                rmSync(fullPath, { recursive: true, force: true });
            } else {
                unlinkSync(fullPath);
            }

            return { success: true };
        } catch (error) {
            reply.code(500).send({
                error: 'Failed to delete',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });
}
