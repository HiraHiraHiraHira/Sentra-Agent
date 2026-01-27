#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root directory is one level up from sentra-config-ui
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const isForce = args.includes('force') || args.includes('--force');
const trustGitDir = args.includes('trust-git-dir') || args.includes('--trust-git-dir');
const skipBuildDist = args.includes('no-build') || args.includes('--no-build');
const forceBuildDist = args.includes('build-dist') || args.includes('--build-dist') || args.includes('--build');

console.log(chalk.blue.bold('\n🔄 Sentra Agent 更新脚本\n'));
console.log(chalk.gray(`根目录: ${ROOT_DIR}`));
console.log(chalk.gray(`更新模式: ${isForce ? '强制(丢弃本地改动)' : '普通'}\n`));

function normalizeGitPath(p) {
    return String(p || '').replace(/\\/g, '/');
}

function buildNodeInstallArgs(pm) {
    const args = ['install'];
    if (pm === 'pnpm') {
        args.push('--prod=false');
    } else if (pm === 'bun') {
    } else {
        args.push('--production=false');
    }
    return args;
}

function buildNodeInstallEnv(npmRegistry, extraEnv = {}) {
    const envOut = {
        ...extraEnv,
        npm_config_production: 'false',
        NPM_CONFIG_PRODUCTION: 'false',
        NODE_ENV: '',
        BUN_INSTALL_DEV: '1',
    };
    if (npmRegistry) {
        envOut.npm_config_registry = npmRegistry;
        envOut.NPM_CONFIG_REGISTRY = npmRegistry;
    }
    return envOut;
}

function buildGlobalPm2InstallArgs(pm) {
    const v = String(pm || '').toLowerCase();
    if (v === 'pnpm') return ['add', '-g', 'pm2@latest'];
    if (v === 'yarn') return ['global', 'add', 'pm2@latest'];
    if (v === 'bun') return ['add', '-g', 'pm2@latest'];
    return ['install', '-g', 'pm2@latest'];
}

async function ensureGlobalPm2(pm, npmRegistry) {
    const spinner = ora(`[Node] Ensuring global pm2@latest (using ${pm})...`).start();
    try {
        const extraEnv = buildNodeInstallEnv(npmRegistry);
        await execCommand(pm, buildGlobalPm2InstallArgs(pm), ROOT_DIR, extraEnv);
        spinner.succeed('[Node] Global pm2 is ready');
    } catch (e) {
        spinner.fail('[Node] Failed to install/upgrade global pm2 (continuing)');
        try {
            if (pm !== 'npm' && commandExists('npm')) {
                const extraEnv = buildNodeInstallEnv(npmRegistry);
                await execCommand('npm', ['install', '-g', 'pm2@latest'], ROOT_DIR, extraEnv);
                console.log(chalk.green('[Node] Global pm2 installed via npm fallback'));
            }
        } catch {
            console.log(chalk.gray('You can try manually: npm install -g pm2@latest'));
        }
    }
}

function isDubiousOwnershipText(text) {
    const t = String(text || '');
    return /detected\s+dubious\s+ownership/i.test(t) || /safe\.directory/i.test(t);
}

async function ensureGitSafeDirectory(repoDir) {
    const safeDir = normalizeGitPath(repoDir);
    try {
        await execCommand('git', ['config', '--global', '--add', 'safe.directory', safeDir], os.homedir());
        console.log(chalk.green(`✅ Added git safe.directory: ${safeDir}`));
    } catch (e) {
        console.warn(chalk.yellow(`⚠️ Failed to set safe.directory automatically. You can run:`));
        console.warn(chalk.cyan(`   git config --global --add safe.directory ${safeDir}`));
        throw e;
    }
}

function exists(p) {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
}

function getFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return crypto.createHash('md5').update(content).digest('hex');
    } catch {
        return null;
    }
}

function isNodeProject(dir) {
    return exists(path.join(dir, 'package.json'));
}

function isPythonProject(dir) {
    return exists(path.join(dir, 'requirements.txt'));
}

function listSentraSubdirs(root) {
    const out = [];
    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const e of entries) {
            if (e.isDirectory() && e.name.startsWith('sentra-')) {
                out.push(path.join(root, e.name));
            }
        }
    } catch {
        // Ignore errors
    }
    return out;
}

const LOCK_FILE_BASENAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);



/**
 * Recursively find nested projects in a given directory
 */
function listNestedProjects(dir) {
    const results = [];
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        const name = e.name;
        if (name === 'node_modules' || name === '.venv' || name === '__pycache__' || name.startsWith('.')) continue;

        const sub = path.join(dir, name);
        if (isNodeProject(sub) || isPythonProject(sub)) {
            results.push(sub);
        }
    }
    return results;
}

function collectAllProjects() {
    const projects = new Set();
    const uiDir = path.resolve(ROOT_DIR, 'sentra-config-ui');

    const tryAdd = (d) => {
        if (isNodeProject(d) || isPythonProject(d)) projects.add(d);
    };

    tryAdd(ROOT_DIR);
    tryAdd(uiDir);

    // Add all sentra-* directories
    for (const dir of listSentraSubdirs(ROOT_DIR)) {
        tryAdd(dir);
        // Also include one-level nested projects
        for (const nested of listNestedProjects(dir)) {
            projects.add(nested);
        }
    }

    return Array.from(projects);
}



// --- Python Venv Management ---

function getVenvPath(projectDir) {
    return path.join(projectDir, '.venv');
}

function getVenvPython(projectDir) {
    const venv = getVenvPath(projectDir);
    // Windows: .venv/Scripts/python.exe
    // POSIX: .venv/bin/python
    if (process.platform === 'win32') {
        return path.join(venv, 'Scripts', 'python.exe');
    } else {
        return path.join(venv, 'bin', 'python');
    }
}

function getVenvPip(projectDir) {
    const venv = getVenvPath(projectDir);
    if (process.platform === 'win32') {
        return path.join(venv, 'Scripts', 'pip.exe');
    } else {
        return path.join(venv, 'bin', 'pip');
    }
}

async function ensureVenv(projectDir, spinner) {
    const venvPath = getVenvPath(projectDir);
    const pythonExe = getVenvPython(projectDir);

    if (!exists(pythonExe)) {
        if (spinner) spinner.text = 'Creating virtual environment...';
        else console.log(chalk.gray('    Creating virtual environment (.venv)...'));

        await execCommand('python', ['-m', 'venv', '.venv'], projectDir);
    }
    return venvPath;
}

/**
 * 获取 lock 文件的哈希值（支持 pnpm-lock.yaml, package-lock.json, yarn.lock）
 */
function getLockFileHash(dir) {
    const lockFiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];
    for (const lockFile of lockFiles) {
        const lockPath = path.join(dir, lockFile);
        const hash = getFileHash(lockPath);
        if (hash) return { file: lockFile, hash };
    }
    return { file: null, hash: null };
}

function resolveMirrorProfileDefaults() {
    const profile = String(process.env.MIRROR_PROFILE || '').toLowerCase();
    const isChina = profile === 'china' || profile === 'cn' || profile === 'tsinghua' || profile === 'npmmirror' || profile === 'taobao';
    return {
        npmRegistryDefault: isChina ? 'https://registry.npmmirror.com/' : '',
    };
}

function resolveNpmRegistry() {
    const { npmRegistryDefault } = resolveMirrorProfileDefaults();
    return (
        process.env.NPM_REGISTRY ||
        process.env.NPM_CONFIG_REGISTRY ||
        process.env.npm_config_registry ||
        npmRegistryDefault ||
        ''
    );
}

function resolveBuildMaxOldSpaceSizeMb() {
    const gb = os.totalmem() / (1024 * 1024 * 1024);
    if (!Number.isFinite(gb) || gb <= 0) return 2048;
    if (gb >= 16) return 6144;
    if (gb >= 8) return 4096;
    if (gb >= 4) return 3072;
    return 2048;
}

function shouldAutoBuildDist() {
    if (skipBuildDist) return false;
    if (forceBuildDist) return true;
    return os.totalmem() >= 3 * 1024 * 1024 * 1024;
}

function safeReadJson(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function hasInstalledNodePackage(projectDir, pkgName) {
    const parts = String(pkgName || '').split('/').filter(Boolean);
    if (parts.length === 0) return false;
    const p = path.join(projectDir, 'node_modules', ...parts);
    try {
        const st = fs.lstatSync(p);
        return st.isDirectory() || st.isSymbolicLink();
    } catch {
        return false;
    }
}

function listMissingNodeDeps(projectDir) {
    const pkgPath = path.join(projectDir, 'package.json');
    const pkg = safeReadJson(pkgPath);
    if (!pkg || typeof pkg !== 'object') return [];

    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    const direct = Array.from(new Set([...deps, ...devDeps])).filter(Boolean);

    const missing = [];
    for (const dep of direct) {
        if (!hasInstalledNodePackage(projectDir, dep)) missing.push(dep);
    }
    return missing;
}

function hasPuppeteerDependency(projectDir) {
    const pkgPath = path.join(projectDir, 'package.json');
    if (!exists(pkgPath)) return false;
    try {
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        return !!(pkg?.dependencies?.puppeteer || pkg?.devDependencies?.puppeteer);
    } catch {
        return false;
    }
}

async function ensurePuppeteerBrowserForMcp(pm) {
    const mcpDir = path.join(ROOT_DIR, 'sentra-mcp');
    if (!exists(mcpDir) || !isNodeProject(mcpDir) || !hasPuppeteerDependency(mcpDir)) {
        return;
    }

    const label = path.relative(ROOT_DIR, mcpDir) || 'sentra-mcp';
    const spinner = ora(`[Node] Ensuring Puppeteer Chrome browser for ${label}...`).start();

    const cmd = pm === 'pnpm' ? 'pnpm' : 'npx';
    const args = pm === 'pnpm'
        ? ['exec', 'puppeteer', 'browsers', 'install', 'chrome']
        : ['puppeteer', 'browsers', 'install', 'chrome'];

    try {
        await execCommand(cmd, args, mcpDir);
        spinner.succeed(`[Node] Puppeteer Chrome browser ready for ${label}`);
    } catch (error) {
        spinner.fail(`[Node] Failed to install Puppeteer Chrome browser for ${label}`);
        console.warn(chalk.yellow(`You may need to run "${cmd} ${args.join(' ')}" manually in ${mcpDir}`));
    }
}

function commandExists(cmd, checkArgs = ['--version']) {
    try {
        const r = spawnSync(cmd, checkArgs, { stdio: 'ignore', shell: true });
        return r.status === 0;
    } catch {
        return false;
    }
}

function choosePM(preferred) {
    if (preferred && preferred !== 'auto') {
        if (!commandExists(preferred)) {
            throw new Error(`Package manager ${preferred} not found in PATH`);
        }
        return preferred;
    }
    // Auto detection priority: pnpm > bun > npm > cnpm > yarn
    if (commandExists('pnpm')) return 'pnpm';
    if (commandExists('bun')) return 'bun';
    if (commandExists('npm')) return 'npm';
    if (commandExists('cnpm')) return 'cnpm';
    if (commandExists('yarn')) return 'yarn';
    throw new Error('No package manager found. Please install one or set PACKAGE_MANAGER in .env');
}

async function execCommand(command, args, cwd, extraEnv = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            cwd,
            shell: true,
            env: {
                ...process.env,
                ...extraEnv,
                FORCE_COLOR: '3',
            }
        });

        let stdout = '';
        let stderr = '';
        const maxBuf = 16 * 1024;
        const trimBuf = (s) => (s.length > maxBuf ? s.slice(s.length - maxBuf) : s);

        proc.stdout?.on('data', (data) => {
            const s = data.toString();
            stdout = trimBuf(stdout + s);
            try { process.stdout.write(s); } catch { }
        });

        proc.stderr?.on('data', (data) => {
            const s = data.toString();
            stderr = trimBuf(stderr + s);
            try { process.stderr.write(s); } catch { }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                const combined = `${stdout}\n${stderr}`;
                const err = new Error(`Command failed with exit code ${code}`);
                err.code = code;
                err.details = combined;
                if (isDubiousOwnershipText(combined)) {
                    err.kind = 'DUBIOUS_OWNERSHIP';
                }
                reject(err);
            }
        });

        proc.on('error', reject);
    });
}

// Load .env file
const envPath = path.join(ROOT_DIR, 'sentra-config-ui', '.env');
let env = {};
try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
            env[key] = value;
        }
    });
} catch (e) {
    // Ignore if .env missing
}

function getUpdateSourceUrl() {
    const source = (env.UPDATE_SOURCE || 'github').toLowerCase();
    const customUrl = env.UPDATE_CUSTOM_URL;

    if (source === 'gitee') {
        return 'https://gitee.com/yuanpluss/Sentra-Agent.git';
    } else if (source === 'custom' && customUrl) {
        return customUrl;
    }
    // Default to GitHub
    return 'https://github.com/JustForSO/Sentra-Agent.git';
}

async function switchRemote(url) {
    try {
        // Check current remote
        const currentRemote = (await execCommandOutput('git', ['remote', 'get-url', 'origin'], ROOT_DIR)).trim();

        if (currentRemote !== url) {
            console.log(chalk.yellow(`\n🔄 Switching remote from ${currentRemote} to ${url}...`));
            await execCommand('git', ['remote', 'set-url', 'origin', url], ROOT_DIR);
            console.log(chalk.green('✅ Remote updated successfully'));
        }
    } catch (e) {
        // If remote doesn't exist, add it
        try {
            await execCommand('git', ['remote', 'add', 'origin', url], ROOT_DIR);
            console.log(chalk.green('✅ Remote added successfully'));
        } catch (err) {
            console.warn(chalk.red('⚠️ Failed to update remote URL:'), err.message);
        }
    }
}

async function execCommandOutput(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { cwd, shell: true });
        let output = '';
        let errOutput = '';
        proc.stdout.on('data', (data) => output += data.toString());
        proc.stderr?.on('data', (data) => errOutput += data.toString());
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(output);
                return;
            }
            const combined = `${output}\n${errOutput}`;
            const err = new Error(`Command failed: ${command}`);
            err.code = code;
            err.details = combined;
            if (isDubiousOwnershipText(combined)) {
                err.kind = 'DUBIOUS_OWNERSHIP';
            }
            reject(err);
        });
        proc.on('error', reject);
    });
}

async function getCurrentBranch(cwd) {
    try {
        const b = (await execCommandOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim();
        if (!b || b === 'HEAD') return 'main';
        return b;
    } catch {
        return 'main';
    }
}

async function getOriginDefaultBranch(cwd) {
    try {
        // e.g. "origin/main"
        const ref = (await execCommandOutput('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd)).trim();
        const m = ref.match(/^origin\/(.+)$/);
        if (m && m[1]) return m[1];
        return null;
    } catch {
        return null;
    }
}

function parseGitStatusPorcelain(text) {
    const lines = String(text || '').split(/\r?\n/).map((x) => x.trimEnd()).filter(Boolean);
    const out = [];
    for (const line of lines) {
        if (line.length < 4) continue;
        const xy = line.slice(0, 2);
        let rest = line.slice(3).trim();
        if (!rest) continue;
        if (rest.includes('->')) {
            const parts = rest.split('->');
            rest = String(parts[parts.length - 1] || '').trim();
        }
        if ((rest.startsWith('"') && rest.endsWith('"')) || (rest.startsWith("'") && rest.endsWith("'"))) {
            rest = rest.slice(1, -1);
        }
        out.push({ xy, path: rest });
    }
    return out;
}

function isLockFilePath(p) {
    const posixPath = String(p || '').replace(/\\/g, '/');
    const base = path.posix.basename(posixPath);
    return LOCK_FILE_BASENAMES.has(base);
}

async function discardLocalLockFileChanges(cwd, spinner) {
    let statusText = '';
    try {
        statusText = await execCommandOutput('git', ['status', '--porcelain'], cwd);
    } catch {
        return { discarded: [], hadAny: false };
    }

    const entries = parseGitStatusPorcelain(statusText);
    const lockEntries = entries.filter((e) => isLockFilePath(e.path));
    if (!lockEntries.length) return { discarded: [], hadAny: false };

    const discarded = [];
    if (spinner) spinner.text = `Discarding local lock file changes (${lockEntries.length})...`;

    for (const e of lockEntries) {
        const file = e.path;
        try {
            if (e.xy === '??') {
                await execCommand('git', ['clean', '-f', '--', file], cwd);
            } else {
                await execCommand('git', ['checkout', '--', file], cwd);
            }
            discarded.push(file);
        } catch {
            // ignore
        }
    }

    return { discarded, hadAny: true };
}

async function update() {
    const spinner = ora();

    try {
        // Step -1: Git safety check for Windows 'dubious ownership' (optional auto-fix)
        if (trustGitDir) {
            console.log(chalk.cyan('\n🔐 Git 安全目录：已启用（如遇 dubious ownership 将尝试自动添加 safe.directory）'));
            await ensureGitSafeDirectory(ROOT_DIR);
            console.log();
        }

        // Step 0: Configure Remote
        const targetUrl = getUpdateSourceUrl();
        console.log(chalk.cyan(`\n🌐 更新源: ${env.UPDATE_SOURCE || 'github'} (${targetUrl})`));
        await switchRemote(targetUrl);

        // Step 1: Detect projects and record pre-update hashes
        console.log(chalk.cyan('\n📦 正在扫描项目...\n'));
        const projects = collectAllProjects();
        const beforeHashes = new Map();

        for (const dir of projects) {
            const label = path.relative(ROOT_DIR, dir) || '.';
            const isNode = isNodeProject(dir);
            const isPy = isPythonProject(dir);

            let typeStr = '';
            if (isNode) typeStr += 'Node';
            if (isPy) typeStr += (typeStr ? '/Python' : 'Python');

            console.log(chalk.gray(`  发现 [${typeStr}]: ${label}`));

            if (isNode) {
                beforeHashes.set(dir + ':pkg', getFileHash(path.join(dir, 'package.json')));
                const lockInfo = getLockFileHash(dir);
                beforeHashes.set(dir + ':lock', lockInfo.hash);
                beforeHashes.set(dir + ':lockFile', lockInfo.file);
            }
            if (isPy) beforeHashes.set(dir + ':req', getFileHash(path.join(dir, 'requirements.txt')));
        }
        console.log();



        // Step 2: Git operations
        if (isForce) {
            console.log(chalk.yellow.bold('⚠️  强制更新模式：将丢弃本地改动！\n'));
            const originDefault = await getOriginDefaultBranch(ROOT_DIR);
            const branch = originDefault || await getCurrentBranch(ROOT_DIR);
            spinner.start('正在拉取远端最新信息...');
            await execCommand('git', ['fetch', '--all', '--prune'], ROOT_DIR);
            spinner.succeed('已拉取远端信息');

            spinner.start(`正在重置到 origin/${branch}...`);
            await execCommand('git', ['reset', '--hard', `origin/${branch}`], ROOT_DIR);
            spinner.succeed(`已重置到 origin/${branch}`);

            spinner.start('正在清理未跟踪文件...');
            await execCommand('git', ['clean', '-fd'], ROOT_DIR);
            spinner.succeed('已清理未跟踪文件');
        } else {
            spinner.start('正在检查更新...');
            await execCommand('git', ['fetch'], ROOT_DIR);
            spinner.succeed('更新检查完成');

            await discardLocalLockFileChanges(ROOT_DIR, spinner);

            spinner.start('正在拉取最新代码...');
            try {
                await execCommand('git', ['pull'], ROOT_DIR);
                spinner.succeed('已拉取最新代码');
            } catch (e) {
                const r = await discardLocalLockFileChanges(ROOT_DIR, spinner);
                if (r.hadAny) {
                    spinner.start('检测到 lock 文件冲突，已丢弃本地 lock 变更，正在重试拉取...');
                    try {
                        await execCommand('git', ['pull'], ROOT_DIR);
                        spinner.succeed('已拉取最新代码');
                    } catch (e2) {
                        spinner.fail('拉取失败（可能存在冲突）');
                        console.log(chalk.yellow('\n💡 提示：如果本地有冲突，建议使用强制更新：node scripts/update.mjs --force'));
                        throw e2;
                    }
                } else {
                    spinner.fail('拉取失败（可能存在冲突）');
                    console.log(chalk.yellow('\n💡 提示：如果本地有冲突，建议使用强制更新：node scripts/update.mjs --force'));
                    throw e;
                }
            }
        }

        // Step 3: Check which projects need installation
        console.log(chalk.cyan('\n🔍 正在检查依赖变化...\n'));
        const installQueue = [];

        for (const dir of projects) {
            const label = path.relative(ROOT_DIR, dir) || '.';
            const isNode = isNodeProject(dir);
            const isPy = isPythonProject(dir);

            // --- Node Check ---
            if (isNode) {
                const nmPath = path.join(dir, 'node_modules');
                const pkgPath = path.join(dir, 'package.json');
                const beforePkgHash = beforeHashes.get(dir + ':pkg');
                const afterPkgHash = getFileHash(pkgPath);
                const beforeLockHash = beforeHashes.get(dir + ':lock');
                const afterLockInfo = getLockFileHash(dir);
                const afterLockHash = afterLockInfo.hash;
                const lockFileName = afterLockInfo.file || beforeHashes.get(dir + ':lockFile') || 'lock file';

                if (!exists(nmPath)) {
                    console.log(chalk.yellow(`  [Node] ${label}: node_modules 缺失 → 需要安装依赖`));
                    installQueue.push({ dir, label, type: 'node', reason: 'missing node_modules' });
                } else if (beforePkgHash !== afterPkgHash) {
                    console.log(chalk.yellow(`  [Node] ${label}: package.json 有变化 → 需要安装依赖`));
                    installQueue.push({ dir, label, type: 'node', reason: 'package.json changed' });
                } else if (beforeLockHash !== afterLockHash) {
                    console.log(chalk.yellow(`  [Node] ${label}: ${lockFileName} 有变化 → 需要安装依赖`));
                    installQueue.push({ dir, label, type: 'node', reason: `${lockFileName} changed` });
                } else if (isForce) {
                    console.log(chalk.yellow(`  [Node] ${label}: 强制更新 → 重新安装依赖`));
                    installQueue.push({ dir, label, type: 'node', reason: 'force update' });
                } else {
                    const missing = listMissingNodeDeps(dir);
                    if (missing.length > 0) {
                        const preview = missing.slice(0, 8);
                        const more = missing.length > preview.length ? ` (+${missing.length - preview.length} more)` : '';
                        const reason = `missing deps: ${preview.join(', ')}${more}`;
                        console.log(chalk.yellow(`  [Node] ${label}: ${reason} → 需要安装依赖`));
                        installQueue.push({ dir, label, type: 'node', reason });
                    } else {
                        console.log(chalk.gray(`  [Node] ${label}: 无变化 → 跳过`));
                    }
                }
            }

            // --- Python Check ---
            if (isPy) {
                const venvPath = getVenvPath(dir);
                const reqPath = path.join(dir, 'requirements.txt');
                const beforeHash = beforeHashes.get(dir + ':req');
                const afterHash = getFileHash(reqPath);
                const venvPython = getVenvPython(dir);

                if (!exists(venvPath) || !exists(venvPython)) {
                    console.log(chalk.yellow(`  [Python] ${label}: 虚拟环境缺失/损坏 → 需要安装依赖`));
                    installQueue.push({ dir, label, type: 'python', reason: 'missing .venv' });
                } else if (beforeHash !== afterHash) {
                    console.log(chalk.yellow(`  [Python] ${label}: requirements.txt 有变化 → 需要安装依赖`));
                    installQueue.push({ dir, label, type: 'python', reason: 'requirements.txt changed' });
                } else if (isForce) {
                    console.log(chalk.yellow(`  [Python] ${label}: 强制更新 → 重新安装依赖`));
                    installQueue.push({ dir, label, type: 'python', reason: 'force update' });
                } else {
                    console.log(chalk.gray(`  [Python] ${label}: no changes → skip`));
                }
            }
        }

        if (!isForce) {
            const uiDir = path.resolve(ROOT_DIR, 'sentra-config-ui');
            const uiLabel = path.relative(ROOT_DIR, uiDir) || 'sentra-config-ui';
            const alreadyQueued = installQueue.some((x) => x && x.type === 'node' && x.dir === uiDir);
            if (!alreadyQueued && isNodeProject(uiDir)) {
                console.log(chalk.yellow(`  [Node] ${uiLabel}: 更新后兜底 → 需要安装依赖`));
                installQueue.push({ dir: uiDir, label: uiLabel, type: 'node', reason: 'post-update safeguard' });
            }
        }

        // Step 4: Execute Installations
        const npmRegistry = resolveNpmRegistry();
        const pm = choosePM(env.PACKAGE_MANAGER || 'auto');

        await ensureGlobalPm2(pm, npmRegistry);

        if (installQueue.length > 0) {
            console.log(chalk.cyan(`\n📥 开始安装依赖（共 ${installQueue.length} 个目标）...\n`));

            for (const item of installQueue) {
                const { dir, label, type, reason } = item;

                if (type === 'node') {
                    spinner.start(`[Node] 正在安装 ${label}（${reason}）...`);
                    try {
                        const installArgs = buildNodeInstallArgs(pm);
                        const extraEnv = buildNodeInstallEnv(npmRegistry);
                        await execCommand(pm, installArgs, dir, extraEnv);
                        spinner.succeed(`[Node] 已安装 ${label}`);
                    } catch (error) {
                        spinner.fail(`[Node] 安装失败：${label}`);
                        console.log(chalk.yellow('\n💡 你可以尝试手动执行（在对应目录下）：'));
                        console.log(chalk.cyan(`   ${pm} ${buildNodeInstallArgs(pm).join(' ')}`));
                        throw error;
                    }
                } else if (type === 'python') {
                    spinner.start(`[Python] 正在准备 ${label}（${reason}）...`);
                    try {
                        await ensureVenv(dir, spinner);
                        const pip = getVenvPip(dir);
                        if (!exists(pip)) throw new Error(`Pip not found at ${pip}`);

                        spinner.text = `[Python] 正在安装依赖：${label}...`;
                        await execCommand(pip, ['install', '-r', 'requirements.txt'], dir);
                        spinner.succeed(`[Python] 已安装 ${label}`);
                    } catch (error) {
                        spinner.fail(`[Python] 安装失败：${label}`);
                        console.log(chalk.yellow('\n💡 你可以尝试手动执行（在对应目录下）：'));
                        console.log(chalk.cyan('   .venv/bin/pip install -r requirements.txt  （Windows: .venv\\Scripts\\pip.exe）'));
                        throw error;
                    }
                }
            }
            // After Node dependencies are ensured, make sure Puppeteer-managed Chrome is installed for sentra-mcp if applicable
            await ensurePuppeteerBrowserForMcp(pm);
        } else {
            console.log(chalk.green('\n✨ 未检测到依赖变化，跳过安装\n'));
        }

        const uiDir = path.resolve(ROOT_DIR, 'sentra-config-ui');
        if (!skipBuildDist && isNodeProject(uiDir)) {
            const maxOldSpaceSizeMb = resolveBuildMaxOldSpaceSizeMb();
            spinner.start(`[UI] 正在构建（tsc && vite build，NODE_OPTIONS=--max-old-space-size=${maxOldSpaceSizeMb}）...`);
            try {
                const buildEnv = { NODE_OPTIONS: `--max-old-space-size=${maxOldSpaceSizeMb}` };
                if (npmRegistry) {
                    buildEnv.npm_config_registry = npmRegistry;
                    buildEnv.NPM_CONFIG_REGISTRY = npmRegistry;
                }
                await execCommand(pm, ['run', 'build'], uiDir, buildEnv);
                spinner.succeed('[UI] 构建完成');
            } catch (e) {
                spinner.fail('[UI] 构建失败');
                console.log(chalk.yellow('\n💡 提示：如果构建时出现 “JavaScript heap out of memory”：'));
                console.log(chalk.gray('   - 建议在内存更高的机器构建 dist，再把 dist 部署到低配机器'));
                console.log(chalk.gray('   - 或执行：node --max-old-space-size=4096 ./node_modules/vite/bin/vite.js build'));
                console.log(chalk.gray('   - 或重新运行更新并强制构建：node scripts/update.mjs --build-dist'));
            }
        } else if (skipBuildDist) {
            console.log(chalk.gray('\n[UI] 已按参数跳过构建（--no-build）'));
        }

        console.log(chalk.green.bold('\n✅ 更新完成！\n'));
        process.exit(0);
    } catch (error) {
        spinner.fail('更新失败');

        if (error && error.kind === 'DUBIOUS_OWNERSHIP') {
            const safeDir = normalizeGitPath(ROOT_DIR);
            console.error(chalk.red('\n❌ Error: Git detected dubious ownership for this repository.'));
            console.log(chalk.yellow('\n原因：仓库目录的所有者与当前用户不一致（Windows 常见于管理员/解压/复制导致）。Git 会拒绝执行任何操作。'));
            console.log(chalk.cyan('\n✅ 解决方案（推荐）：'));
            console.log(chalk.cyan(`   git config --global --add safe.directory ${safeDir}`));
            console.log(chalk.gray('\n然后重新执行更新即可。'));
            console.log(chalk.gray('\n你也可以用参数自动修复：'));
            console.log(chalk.cyan('   node scripts/update.mjs --trust-git-dir'));
        } else {
            console.error(chalk.red('\n❌ 错误:'), error?.message || String(error));
            if (error?.details) {
                console.log(chalk.gray('\n--- 最近的命令输出（截断）---'));
                console.log(chalk.gray(String(error.details).trim() || '(无)'));
            }
        }
        process.exit(1);
    }
}

update();
