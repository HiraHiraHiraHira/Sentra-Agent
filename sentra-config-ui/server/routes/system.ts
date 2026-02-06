
import { FastifyInstance } from 'fastify';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import { scriptRunner } from '../scriptRunner';

let lastUiHeartbeat = 0;
let uiOnline = false;
let staleLogged = false;
let heartbeatTimer: NodeJS.Timeout | null = null;

let lastUpdateCheckTs = 0;
let lastUpdateCheckRes: any = null;

function normalizeRemoteUrl(url: string): string {
    let u = String(url || '').trim();
    if (!u) return '';
    u = u.replace(/\s+/g, '');
    u = u.replace(/\/+$/g, '');
    u = u.replace(/\.git$/i, '');
    return u;
}

function getConfiguredUpdateSource(): { source: string; url: string } {
    const source = String(process.env.UPDATE_SOURCE || 'github').trim().toLowerCase();
    const customUrl = String(process.env.UPDATE_CUSTOM_URL || '').trim();

    if (source === 'gitee') {
        return { source, url: 'https://gitee.com/yuanpluss/Sentra-Agent.git' };
    }
    if (source === 'custom' && customUrl) {
        return { source, url: customUrl };
    }
    return { source: 'github', url: 'https://github.com/JustForSO/Sentra-Agent.git' };
}

function ensureOriginRemote(repoDir: string, targetUrl: string): { ok: boolean; originUrl: string; changed: boolean; error?: string } {
    if (!targetUrl) {
        return { ok: true, originUrl: '', changed: false };
    }

    const getUrl = runGit(repoDir, ['remote', 'get-url', 'origin']);
    const originUrl = String(getUrl.stdout || '').trim();
    const same = normalizeRemoteUrl(originUrl) && normalizeRemoteUrl(originUrl) === normalizeRemoteUrl(targetUrl);
    if (same) {
        return { ok: true, originUrl, changed: false };
    }

    // Best-effort align origin with configured update source (matches scripts/update.mjs behavior)
    const setUrl = runGit(repoDir, ['remote', 'set-url', 'origin', targetUrl]);
    if (setUrl.ok) {
        const after = runGit(repoDir, ['remote', 'get-url', 'origin']);
        return { ok: true, originUrl: String(after.stdout || '').trim() || originUrl, changed: true };
    }

    const addUrl = runGit(repoDir, ['remote', 'add', 'origin', targetUrl]);
    if (addUrl.ok) {
        const after = runGit(repoDir, ['remote', 'get-url', 'origin']);
        return { ok: true, originUrl: String(after.stdout || '').trim() || originUrl, changed: true };
    }

    return {
        ok: false,
        originUrl,
        changed: false,
        error: String(setUrl.stderr || addUrl.stderr || '').trim() || 'failed to set origin remote',
    };
}

function fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                raw += String(chunk || '');
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(raw || '{}');
                    resolve(parsed);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
            try { req.destroy(new Error('timeout')); } catch { }
        });
    });
}

function gitAvailable(): boolean {
    try {
        const r = spawnSync('git', ['--version'], { stdio: 'ignore', shell: true });
        return r.status === 0;
    } catch {
        return false;
    }
}

function runGit(repoDir: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
    try {
        const r = spawnSync('git', args, { cwd: repoDir, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
        return { ok: r.status === 0, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
    } catch (e) {
        return { ok: false, stdout: '', stderr: e instanceof Error ? e.message : String(e) };
    }
}

export async function systemRoutes(fastify: FastifyInstance) {
    if (!heartbeatTimer) {
        heartbeatTimer = setInterval(() => {
            if (!uiOnline) return;
            const now = Date.now();
            const STALE_MS = 60_000;
            if (!lastUiHeartbeat || (now - lastUiHeartbeat) <= STALE_MS) {
                staleLogged = false;
                return;
            }
            uiOnline = false;
            if (!staleLogged) {
                staleLogged = true;
                fastify.log.warn({ lastUiHeartbeat }, '[System] UI heartbeat stale; marking UI offline (no auto-cleanup).');
            }
        }, 15_000);
    }

    fastify.post<{
        Body: { scope?: string; ts?: number };
    }>('/api/system/ui/heartbeat', async (_request) => {
        uiOnline = true;
        lastUiHeartbeat = Date.now();
        return { success: true, ts: lastUiHeartbeat };
    });

    fastify.post('/api/system/cleanup', async () => {
        const res = scriptRunner.cleanupAll({ includePm2: true });
        return { success: true, res };
    });

    fastify.get('/api/system/network', async (_request, reply) => {
        const clientPort = process.env.CLIENT_PORT || '7244';
        const serverPort = process.env.SERVER_PORT || '7245';

        const nets = os.networkInterfaces();
        const local: Array<{ name: string; address: string; family: string; internal: boolean; mac?: string; cidr?: string | null }> = [];
        for (const name of Object.keys(nets || {})) {
            const list = (nets as any)?.[name] as any[] | undefined;
            if (!Array.isArray(list)) continue;
            for (const n of list) {
                if (!n || typeof n !== 'object') continue;
                local.push({
                    name: String(name),
                    address: String(n.address || ''),
                    family: String(n.family || ''),
                    internal: !!n.internal,
                    mac: n.mac ? String(n.mac) : undefined,
                    cidr: typeof n.cidr === 'string' ? n.cidr : null,
                });
            }
        }

        let publicInfo: any = null;
        let publicError = '';
        try {
            publicInfo = await fetchJson('https://ipapi.co/json/');
        } catch (e) {
            publicError = e instanceof Error ? e.message : String(e);
        }

        reply.send({
            hostname: os.hostname(),
            serverPort,
            clientPort,
            local,
            public: publicInfo,
            publicError: publicError || undefined,
            fetchedAt: Date.now(),
        });
    });

    fastify.get('/api/system/update/check', async (_request, reply) => {
        const now = Date.now();
        const CACHE_MS = 30_000;
        if (lastUpdateCheckRes && lastUpdateCheckTs > 0 && (now - lastUpdateCheckTs) <= CACHE_MS) {
            reply.send(lastUpdateCheckRes);
            return;
        }

        if (!gitAvailable()) {
            const res = { success: false, error: 'git not available', checkedAt: now };
            lastUpdateCheckTs = now;
            lastUpdateCheckRes = res;
            reply.send(res);
            return;
        }

        const candidates: string[] = [];
        candidates.push(process.cwd());

        const sentraRootRel = String(process.env.SENTRA_ROOT || '').trim();
        if (sentraRootRel) {
            candidates.push(path.resolve(process.cwd(), sentraRootRel));
        }

        candidates.push(path.resolve(process.cwd(), '..'));
        candidates.push(path.resolve(process.cwd(), '../..'));
        candidates.push(path.resolve(process.cwd(), '../../..'));

        let repoDir = '';
        for (const c of candidates) {
            const rev = runGit(c, ['rev-parse', '--is-inside-work-tree']);
            if (rev.ok && String(rev.stdout || '').trim().toLowerCase().includes('true')) {
                repoDir = c;
                break;
            }
        }

        if (!repoDir) {
            const res = { success: false, error: 'not a git worktree', checkedAt: now };
            lastUpdateCheckTs = now;
            lastUpdateCheckRes = res;
            reply.send(res);
            return;
        }

        const cfg = getConfiguredUpdateSource();
        const originRes = ensureOriginRemote(repoDir, cfg.url);

        // Best-effort fetch. If network is down, still return local info.
        const fetchRes = runGit(repoDir, ['fetch', '--prune']);

        const head = runGit(repoDir, ['rev-parse', 'HEAD']);
        const branch0 = runGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
        const originHead = runGit(repoDir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);

        const currentBranch = String(branch0.stdout || '').trim() || 'main';
        const originDefaultRef = String(originHead.stdout || '').trim();
        const originBranch = originDefaultRef.startsWith('origin/') ? originDefaultRef.slice('origin/'.length) : '';
        const remoteBranch = originBranch || (currentBranch === 'HEAD' ? 'main' : currentBranch);

        const remoteRef = `origin/${remoteBranch}`;
        const remote = runGit(repoDir, ['rev-parse', remoteRef]);
        if (!remote.ok) {
            const res = {
                success: false,
                checkedAt: now,
                repoDir,
                updateSource: cfg.source,
                updateSourceUrl: cfg.url,
                originUrl: originRes.originUrl || undefined,
                originAligned: originRes.ok ? normalizeRemoteUrl(originRes.originUrl) === normalizeRemoteUrl(cfg.url) : false,
                originChanged: !!originRes.changed,
                originError: originRes.ok ? undefined : originRes.error,
                branch: currentBranch,
                remoteBranch,
                remoteRef,
                error: `remote ref not available: ${remoteRef}`,
                details: String(remote.stderr || '').trim() || undefined,
                fetchOk: fetchRes.ok,
                fetchError: fetchRes.ok ? undefined : (String(fetchRes.stderr || '').trim() || 'git fetch failed'),
            };
            lastUpdateCheckTs = now;
            lastUpdateCheckRes = res;
            reply.send(res);
            return;
        }
        const behind = runGit(repoDir, ['rev-list', '--count', `HEAD..origin/${remoteBranch}`]);
        const ahead = runGit(repoDir, ['rev-list', '--count', `origin/${remoteBranch}..HEAD`]);
        const log = runGit(repoDir, ['log', '--oneline', '--max-count=20', `HEAD..origin/${remoteBranch}`]);
        const logRich = runGit(repoDir, ['log', '--max-count=20', '--date=iso', '--pretty=format:%H%x09%an%x09%ad%x09%s', `HEAD..origin/${remoteBranch}`]);
        const diffFiles = runGit(repoDir, ['diff', '--name-status', `HEAD..origin/${remoteBranch}`]);

        const behindCount = Number.parseInt(String(behind.stdout || '0').trim(), 10);
        const aheadCount = Number.parseInt(String(ahead.stdout || '0').trim(), 10);
        const logLines = String(log.stdout || '')
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean);

        const commits = String(logRich.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const parts = line.split('\t');
                const sha = String(parts[0] || '').trim();
                const author = String(parts[1] || '').trim();
                const date = String(parts[2] || '').trim();
                const subject = String(parts.slice(3).join('\t') || '').trim();
                return {
                    sha,
                    shortSha: sha ? sha.slice(0, 7) : '',
                    author,
                    date,
                    subject,
                };
            })
            .filter((c) => !!c.sha);

        const files = String(diffFiles.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [statusRaw, ...rest] = line.split(/\s+/);
                const file = rest.join(' ').trim();
                return { status: String(statusRaw || '').trim(), file };
            })
            .filter((x) => !!x.file);

        // Optional per-commit file listing (best-effort, keep small)
        if (Number.isFinite(behindCount) && behindCount > 0 && behindCount <= 30 && commits.length > 0) {
            for (const c of commits) {
                const show = runGit(repoDir, ['show', '--name-status', '--pretty=format:', '-1', c.sha]);
                const cl = String(show.stdout || '')
                    .split(/\r?\n/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((line) => {
                        const [st, ...rs] = line.split(/\s+/);
                        const file = rs.join(' ').trim();
                        return { status: String(st || '').trim(), file };
                    })
                    .filter((x) => !!x.file);
                (c as any).files = cl;
            }
        }

        const res = {
            success: true,
            checkedAt: now,
            repoDir,
            updateSource: cfg.source,
            updateSourceUrl: cfg.url,
            originUrl: originRes.originUrl || undefined,
            originAligned: originRes.ok ? normalizeRemoteUrl(originRes.originUrl) === normalizeRemoteUrl(cfg.url) : false,
            originChanged: !!originRes.changed,
            originError: originRes.ok ? undefined : originRes.error,
            branch: currentBranch,
            remoteBranch,
            currentCommit: String(head.stdout || '').trim(),
            remoteCommit: String(remote.stdout || '').trim(),
            behind: Number.isFinite(behindCount) ? Math.max(0, behindCount) : 0,
            ahead: Number.isFinite(aheadCount) ? Math.max(0, aheadCount) : 0,
            hasUpdate: Number.isFinite(behindCount) ? behindCount > 0 : false,
            log: logLines,
            commits,
            files,
            fetchOk: fetchRes.ok,
            fetchError: fetchRes.ok ? undefined : (String(fetchRes.stderr || '').trim() || 'git fetch failed'),
        };

        lastUpdateCheckTs = now;
        lastUpdateCheckRes = res;
        reply.send(res);
    });

    fastify.post('/api/system/restart', async (request, reply) => {
        const serverPort = process.env.SERVER_PORT || '7245';

        const isPm2 = !!process.env.pm_id || !!process.env.PM2_HOME;

        const restartCmdOverride = (process.env.RESTART_CMD || '').trim();

        let scripts: Record<string, string> = {};
        try {
            const pkgPath = path.resolve(process.cwd(), 'package.json');
            const raw = fs.readFileSync(pkgPath, 'utf8');
            const pkg = JSON.parse(raw);
            scripts = (pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
        } catch {
        }

        const lifecycleEvent = (process.env.npm_lifecycle_event || '').trim();

        let restartScript = '';
        if (restartCmdOverride) {
            restartScript = '';
        } else if ((lifecycleEvent === 'server:dev' || lifecycleEvent === 'client:dev') && Object.prototype.hasOwnProperty.call(scripts, 'dev')) {
            restartScript = 'dev';
        } else if (lifecycleEvent && Object.prototype.hasOwnProperty.call(scripts, lifecycleEvent)) {
            restartScript = lifecycleEvent;
        } else if (process.env.NODE_ENV === 'production' && Object.prototype.hasOwnProperty.call(scripts, 'dist:start')) {
            restartScript = 'dist:start';
        } else if (Object.prototype.hasOwnProperty.call(scripts, 'dev')) {
            restartScript = 'dev';
        } else if (Object.prototype.hasOwnProperty.call(scripts, 'service:start')) {
            restartScript = 'service:start';
        }

        const restartCmd = restartCmdOverride || (restartScript ? `npm run ${restartScript}` : 'npm run dev');

        const isDevLike = restartScript === 'dev' || restartScript === 'server:dev' || restartScript === 'client:dev' || restartCmd.includes(' vite');

        // In dev mode, killing the Vite client port will immediately close the UI page (and may cause restart loops).
        // Only restart the backend port; keep Vite running.
        const devRestartCmd = restartCmdOverride || (Object.prototype.hasOwnProperty.call(scripts, 'server:dev') ? 'npm run server:dev' : restartCmd);
        const finalRestartCmd = isDevLike ? devRestartCmd : restartCmd;
        const ports = isDevLike ? `${serverPort}` : `${serverPort}`;

        const body: any = (request as any)?.body || {};
        const includePm2 = typeof body?.includePm2 === 'boolean' ? body.includePm2 : true;

        const scriptPath = path.resolve(process.cwd(), 'scripts', 'reboot.mjs');

        fastify.log.warn(`[System] Initiating restart... Ports: ${ports}, Cmd: ${finalRestartCmd}`);

        try {
            // Best-effort: stop terminal processes started from WebUI; optionally cleanup related PM2 apps (napcat/agent/emo).
            // This is synchronous (spawnSync) so PM2 deletions complete before reboot happens.
            scriptRunner.cleanupAll({ includePm2 });
        } catch {
        }

        if (isPm2) {
            reply.send({ success: true, message: 'System restarting...' });

            await new Promise<void>((resolve) => {
                if ((reply.raw as any)?.writableFinished) return resolve();
                try {
                    reply.raw.once('finish', () => resolve());
                } catch {
                    resolve();
                }
            });

            process.exit(0);
        }

        // Spawn reboot script detached
        const healthUrl = `http://127.0.0.1:${serverPort}/api/health`;
        const child = spawn('node', [
            scriptPath,
            '--ports',
            ports,
            '--cmd',
            finalRestartCmd,
            '--health',
            healthUrl,
        ], {
            detached: true,
            stdio: 'ignore',
            windowsHide: process.platform === 'win32',
        });

        child.unref();

        reply.send({ success: true, message: 'System restarting...' });

        await new Promise<void>((resolve) => {
            if ((reply.raw as any)?.writableFinished) return resolve();
            try {
                reply.raw.once('finish', () => resolve());
            } catch {
                resolve();
            }
        });

        process.exit(0);
    });
}
