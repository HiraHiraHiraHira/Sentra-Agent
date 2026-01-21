import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import fs from 'fs';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import type { IPty } from 'node-pty';

const require = createRequire(import.meta.url);
let pty: any = null;
try {
    pty = require('node-pty');
} catch {
    pty = null;
}

interface ScriptProcess {
    id: string;
    name: 'bootstrap' | 'start' | 'napcat' | 'update' | 'sentiment' | 'shell';
    dedupeKey: string;
    process: ReturnType<typeof spawn> | IPty;
    output: string[];
    exitCode: number | null;
    startTime: Date;
    endTime: Date | null;
    emitter: EventEmitter;
    isPm2Mode?: boolean;
    isPty?: boolean;
}

function commandExists(cmd: string): boolean {
    try {
        if (os.platform() === 'win32') {
            execSync(`where ${cmd}`, { stdio: 'ignore' });
        } else {
            execSync(`command -v ${cmd}`, { stdio: 'ignore' });
        }
        return true;
    } catch {
        return false;
    }
}

function resolveSentimentRunner(runtimeEnv: Record<string, string>): 'uv' | 'python' {
    const prefer = (runtimeEnv.SENTRA_EMO_RUNNER || process.env.SENTRA_EMO_RUNNER || 'auto').toString().toLowerCase();
    const hasUv = commandExists('uv');

    if (prefer === 'uv') return hasUv ? 'uv' : 'python';
    if (prefer === 'python') return 'python';

    // auto: prefer uv when available, otherwise fall back to python
    return hasUv ? 'uv' : 'python';
}

export class ScriptRunner {
    private processes: Map<string, ScriptProcess> = new Map();

    private ensurePtyAvailable() {
        if (!pty || typeof pty.spawn !== 'function') {
            throw new Error('Missing dependency: node-pty. Please run dependency installation for sentra-config-ui (e.g. run update script or run npm/pnpm install).');
        }
    }

    private getPid(p: ScriptProcess): number | undefined {
        const pid = (p.process as any)?.pid;
        return typeof pid === 'number' && Number.isFinite(pid) ? pid : undefined;
    }

    private computeDedupeKey(name: ScriptProcess['name'], args: string[]): string {
        // Some scripts accept sub-commands; they must not share the same running instance.
        // Otherwise UI actions like "napcat build" and "napcat start" will reuse the same processId
        // and appear as the wrong app with identical logs.
        const first = (Array.isArray(args) && args.length ? String(args[0]) : '').toLowerCase();

        if (name === 'napcat') {
            // napcat.mjs supports: start | build
            return `napcat:${first || 'start'}`;
        }

        if (name === 'update') {
            // update.mjs supports optional: force
            const isForce = args.some((a) => String(a).toLowerCase() === 'force');
            return `update:${isForce ? 'force' : 'normal'}`;
        }

        // Default: single instance per script name
        return name;
    }

    private findRunningByDedupeKey(dedupeKey: string): ScriptProcess | undefined {
        for (const p of this.processes.values()) {
            if (p.dedupeKey === dedupeKey && p.exitCode === null) return p;
        }
        return undefined;
    }

    executeScript(scriptName: 'bootstrap' | 'start' | 'napcat' | 'update' | 'sentiment', args: string[] = []): string {
        // Enforce single instance per dedupeKey (script + relevant args)
        const dedupeKey = this.computeDedupeKey(scriptName, args);
        const running = this.findRunningByDedupeKey(dedupeKey);
        if (running) {
            return running.id; // Return existing running id
        }

        const id = `${scriptName}-${Date.now()}`;
        const emitter = new EventEmitter();

        // Load latest .env from UI project to reflect runtime changes without server restart
        let runtimeEnv: Record<string, string> = {};
        try {
            const envPath = path.join(process.cwd(), '.env');
            if (fs.existsSync(envPath)) {
                const parsed = dotenv.parse(fs.readFileSync(envPath));
                runtimeEnv = parsed as unknown as Record<string, string>;
            }
        } catch { }

        const spawnPty = (cmd: string, cmdArgs: string[], cwd: string, extraEnv?: Record<string, string>) => {
            this.ensurePtyAvailable();
            if (!cmd || !String(cmd).trim()) {
                throw new Error('File not found: (empty command)');
            }
            return pty.spawn(cmd, cmdArgs, {
                name: 'xterm-256color',
                cols: 120,
                rows: 30,
                cwd,
                env: {
                    ...process.env,
                    ...runtimeEnv,
                    FORCE_COLOR: '3',
                    CLICOLOR_FORCE: '1',
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                    ...(extraEnv || {}),
                },
            });
        };

        let proc: IPty;

        if (scriptName === 'sentiment') {
            // Special handling for Sentra Emo (Python FastAPI service)
            const scriptPath = 'run.py';
            const cwd = path.join(process.cwd(), '..', 'sentra-emo');
            const runner = resolveSentimentRunner(runtimeEnv);

            if (runner === 'uv') {
                proc = spawnPty('uv', ['run', 'python', scriptPath, ...args], cwd, { PYTHONUNBUFFERED: '1' });
            } else {
                proc = spawnPty('python', [scriptPath, ...args], cwd, { PYTHONUNBUFFERED: '1' });
            }
        } else {
            // Standard node scripts
            const scriptPath = path.join(process.cwd(), 'scripts', `${scriptName}.mjs`);
            // Avoid PATH-dependent 'node' on Windows services; use the current Node executable.
            const nodeCmd = process.execPath || 'node';
            proc = spawnPty(nodeCmd, [scriptPath, ...args], process.cwd());
        }

        const isPm2Mode = scriptName === 'start' && (() => {
            const modeEq = args.find((a) => a.startsWith('--mode='));
            if (modeEq) {
                const value = modeEq.split('=')[1];
                return value === 'pm2';
            }
            const modeIndex = args.indexOf('--mode');
            if (modeIndex !== -1 && args[modeIndex + 1]) {
                return args[modeIndex + 1] === 'pm2';
            }
            return false;
        })();

        const scriptProcess: ScriptProcess = {
            id,
            name: scriptName,
            dedupeKey,
            process: proc,
            output: [],
            exitCode: null,
            startTime: new Date(),
            endTime: null,
            emitter,
            isPm2Mode,
            isPty: true,
        };

        this.processes.set(id, scriptProcess);

        proc.onData((data: any) => {
            const text = data.toString();
            scriptProcess.output.push(text);
            emitter.emit('output', { type: 'stdout', data: text });
        });

        proc.onExit((ev: any) => {
            scriptProcess.exitCode = typeof ev.exitCode === 'number' ? ev.exitCode : 0;
            scriptProcess.endTime = new Date();
            emitter.emit('exit', { code: scriptProcess.exitCode });

            setTimeout(() => {
                this.processes.delete(id);
            }, 5 * 60 * 1000);
        });

        return id;
    }

    executeShell(args: string[] = []): string {
        const shellType = (Array.isArray(args) && args.length ? String(args[0] || '') : '').trim().toLowerCase();

        const id = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const emitter = new EventEmitter();

        let runtimeEnv: Record<string, string> = {};
        try {
            const envPath = path.join(process.cwd(), '.env');
            if (fs.existsSync(envPath)) {
                const parsed = dotenv.parse(fs.readFileSync(envPath));
                runtimeEnv = parsed as unknown as Record<string, string>;
            }
        } catch { }

        const baseEnv = {
            ...process.env,
            ...runtimeEnv,
            FORCE_COLOR: '3',
            CLICOLOR_FORCE: '1',
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
        };

        const isWin = os.platform() === 'win32';
        const candidates: Array<{ cmd: string; args: string[] }> = [];

        const getUserCmd = (key: string) => {
            const v = (runtimeEnv[key] ?? process.env[key] ?? '').toString().trim();
            return v;
        };

        const userCmdPath = getUserCmd('SENTRA_SHELL_CMD_PATH');
        const userPowerShellPath = getUserCmd('SENTRA_SHELL_POWERSHELL_PATH');
        const userPwshPath = getUserCmd('SENTRA_SHELL_PWSH_PATH');
        const userBashPath = getUserCmd('SENTRA_SHELL_BASH_PATH');
        const userGitBashPath = getUserCmd('SENTRA_SHELL_GIT_BASH_PATH');
        const userWslPath = getUserCmd('SENTRA_SHELL_WSL_PATH');
        const userZshPath = getUserCmd('SENTRA_SHELL_ZSH_PATH');
        const userShPath = getUserCmd('SENTRA_SHELL_SH_PATH');

        const findWindowsCmd = () => {
            const comspec = (process.env['ComSpec'] || '').trim();
            if (comspec && fs.existsSync(comspec)) return comspec;
            const sysRoot = (process.env['SystemRoot'] || 'C:\\Windows').trim();
            const p = path.join(sysRoot, 'System32', 'cmd.exe');
            if (fs.existsSync(p)) return p;
            return 'cmd.exe';
        };

        const findWindowsPowerShell = () => {
            const sysRoot = (process.env['SystemRoot'] || 'C:\\Windows').trim();
            const ps51 = path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            if (fs.existsSync(ps51)) return ps51;

            // PowerShell 7 common locations
            const pf = (process.env['ProgramFiles'] || '').trim();
            const pf86 = (process.env['ProgramFiles(x86)'] || '').trim();
            const pwshCandidates = [
                pf ? path.join(pf, 'PowerShell', '7', 'pwsh.exe') : '',
                pf86 ? path.join(pf86, 'PowerShell', '7', 'pwsh.exe') : '',
            ].filter(Boolean);
            for (const p of pwshCandidates) {
                if (p && fs.existsSync(p)) return p;
            }

            if (commandExists('pwsh')) return 'pwsh.exe';
            return 'powershell.exe';
        };

        const findGitBash = () => {
            try {
                const candidates = [
                    path.join(process.env['ProgramFiles'] || '', 'Git', 'bin', 'bash.exe'),
                    path.join(process.env['ProgramFiles'] || '', 'Git', 'usr', 'bin', 'bash.exe'),
                    path.join(process.env['ProgramFiles(x86)'] || '', 'Git', 'bin', 'bash.exe'),
                    path.join(process.env['ProgramFiles(x86)'] || '', 'Git', 'usr', 'bin', 'bash.exe'),
                    path.join(process.env['LocalAppData'] || '', 'Programs', 'Git', 'bin', 'bash.exe'),
                    path.join(process.env['LocalAppData'] || '', 'Programs', 'Git', 'usr', 'bin', 'bash.exe'),
                ].filter(Boolean);
                for (const p of candidates) {
                    if (p && fs.existsSync(p)) return p;
                }
            } catch { }
            return '';
        };

        if (isWin) {
            if (shellType === 'cmd') {
                if (userCmdPath) {
                    candidates.push({ cmd: userCmdPath, args: ['/Q', '/K', 'chcp 65001>nul & PROMPT $P$G'] });
                }
                candidates.push({ cmd: findWindowsCmd(), args: ['/Q', '/K', 'chcp 65001>nul & PROMPT $P$G'] });
                candidates.push({ cmd: 'cmd.exe', args: ['/Q', '/K', 'chcp 65001>nul & PROMPT $P$G'] });
            } else if (shellType === 'bash') {
                if (userBashPath) {
                    candidates.push({ cmd: userBashPath, args: ['-i'] });
                }
                if (userGitBashPath) {
                    candidates.push({ cmd: userGitBashPath, args: ['-i'] });
                }
                if (commandExists('bash')) {
                    candidates.push({ cmd: 'bash', args: ['-i'] });
                }
                const gitBash = findGitBash();
                if (gitBash) {
                    candidates.push({ cmd: gitBash, args: ['-i'] });
                }
                if (userWslPath) {
                    candidates.push({ cmd: userWslPath, args: ['-e', 'bash', '-li'] });
                }
                if (commandExists('wsl')) {
                    candidates.push({ cmd: 'wsl.exe', args: ['-e', 'bash', '-li'] });
                }
                if (userPwshPath) {
                    candidates.push({ cmd: userPwshPath, args: ['-NoLogo', '-NoExit'] });
                }
                if (userPowerShellPath) {
                    candidates.push({ cmd: userPowerShellPath, args: ['-NoLogo', '-NoExit'] });
                }
                candidates.push({ cmd: findWindowsPowerShell(), args: ['-NoLogo', '-NoExit'] });
            } else {
                if (userPwshPath) {
                    candidates.push({ cmd: userPwshPath, args: ['-NoLogo', '-NoExit'] });
                }
                if (userPowerShellPath) {
                    candidates.push({ cmd: userPowerShellPath, args: ['-NoLogo', '-NoExit'] });
                }
                candidates.push({ cmd: findWindowsPowerShell(), args: ['-NoLogo', '-NoExit'] });
                if (commandExists('pwsh')) {
                    candidates.push({ cmd: 'pwsh.exe', args: ['-NoLogo', '-NoExit'] });
                }
                candidates.push({ cmd: 'powershell.exe', args: ['-NoLogo', '-NoExit'] });
                if (userCmdPath) {
                    candidates.push({ cmd: userCmdPath, args: ['/Q', '/K', 'chcp 65001>nul & PROMPT $P$G'] });
                }
                candidates.push({ cmd: findWindowsCmd(), args: ['/Q', '/K', 'chcp 65001>nul & PROMPT $P$G'] });
            }
        } else {
            const want = shellType || 'bash';
            const pushIfExists = (cmd: string, a: string[]) => {
                if (commandExists(cmd)) candidates.push({ cmd, args: a });
            };
            if (want === 'zsh') {
                if (userZshPath) candidates.push({ cmd: userZshPath, args: ['-i'] });
                if (userBashPath) candidates.push({ cmd: userBashPath, args: ['-i'] });
                if (userShPath) candidates.push({ cmd: userShPath, args: ['-i'] });
                pushIfExists('zsh', ['-i']);
                pushIfExists('bash', ['-i']);
                pushIfExists('sh', ['-i']);
            } else if (want === 'sh') {
                if (userShPath) candidates.push({ cmd: userShPath, args: ['-i'] });
                if (userBashPath) candidates.push({ cmd: userBashPath, args: ['-i'] });
                pushIfExists('sh', ['-i']);
                pushIfExists('bash', ['-i']);
            } else {
                if (userBashPath) candidates.push({ cmd: userBashPath, args: ['-i'] });
                if (userShPath) candidates.push({ cmd: userShPath, args: ['-i'] });
                pushIfExists('bash', ['-i']);
                pushIfExists('sh', ['-i']);
            }
            if (candidates.length === 0) {
                candidates.push({ cmd: 'sh', args: ['-i'] });
            }
        }

        let proc: IPty | null = null;
        let selectedCmd = '';
        let lastErr: any = null;

        for (const c of candidates) {
            const cCmd = String(c.cmd || '').trim();
            if (!cCmd) continue;
            try {
                this.ensurePtyAvailable();
                proc = pty.spawn(cCmd, c.args, {
                    name: 'xterm-256color',
                    cols: 120,
                    rows: 30,
                    cwd: process.cwd(),
                    env: baseEnv,
                });
                selectedCmd = cCmd;
                break;
            } catch (e) {
                lastErr = e;
            }
        }

        if (!proc) {
            const attempted = candidates.map((c) => String(c.cmd || '').trim()).filter(Boolean).join(', ');
            const reason = lastErr instanceof Error ? lastErr.message : String(lastErr || 'unknown error');
            throw new Error(`Failed to start shell. attempted=[${attempted}] reason=${reason}`);
        }

        const usedBashFallbackToPwsh = isWin && shellType === 'bash' && selectedCmd.toLowerCase().includes('powershell');

        const scriptProcess: ScriptProcess = {
            id,
            name: 'shell',
            dedupeKey: id,
            process: proc,
            output: [],
            exitCode: null,
            startTime: new Date(),
            endTime: null,
            emitter,
            isPm2Mode: false,
            isPty: true,
        };

        this.processes.set(id, scriptProcess);

        if (usedBashFallbackToPwsh) {
            const msg = 'Bash not found. Install Git for Windows (Git Bash) or enable WSL to use bash.';
            scriptProcess.output.push(msg);
            emitter.emit('output', { type: 'stderr', data: msg + '\r\n' });
        }

        proc.onData((data: any) => {
            const text = data.toString();
            scriptProcess.output.push(text);
            emitter.emit('output', { type: 'stdout', data: text });
        });

        proc.onExit((ev: any) => {
            scriptProcess.exitCode = typeof ev.exitCode === 'number' ? ev.exitCode : 0;
            scriptProcess.endTime = new Date();
            emitter.emit('exit', { code: scriptProcess.exitCode });

            setTimeout(() => {
                this.processes.delete(id);
            }, 5 * 60 * 1000);
        });

        return id;
    }

    getProcess(id: string): ScriptProcess | undefined {
        return this.processes.get(id);
    }

    killProcess(id: string): boolean {
        const record = this.processes.get(id);
        if (!record || record.exitCode !== null) return false;

        const pid = this.getPid(record);
        if (!pid) return false;

        try {
            // Special handling for PM2-managed start script
            if (record.name === 'start') {
                // Kill the wrapper process first
                if (os.platform() === 'win32') {
                    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
                } else {
                    try { process.kill(pid, 'SIGTERM'); } catch { }
                }

                // If pm2 is installed, also delete any lingering PM2 process
                if (record.isPm2Mode && commandExists('pm2')) {
                    try {
                        execSync('pm2 delete sentra-agent', { stdio: 'ignore' });
                        console.log('[ScriptRunner] Deleted PM2 process: sentra-agent');
                    } catch (pm2Error) {
                        console.error('[ScriptRunner] Failed to delete PM2 process:', pm2Error);
                        // Continue anyway since wrapper is killed
                    }
                }
            } else {
                // Normal process termination for other scripts
                if (os.platform() === 'win32') {
                    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
                } else {
                    try { process.kill(pid, 'SIGTERM'); } catch { }
                    setTimeout(() => {
                        try { process.kill(pid, 'SIGKILL'); } catch { }
                    }, 500);
                }
            }
            return true;
        } catch {
            return false;
        }
    }

    resizeProcess(id: string, cols: number, rows: number): boolean {
        const record = this.processes.get(id);
        if (!record || record.exitCode !== null) return false;
        if (!record.isPty) return false;

        const c = Math.max(2, Math.min(500, Math.floor(cols)));
        const r = Math.max(2, Math.min(500, Math.floor(rows)));

        try {
            const p = record.process as IPty;
            p.resize(c, r);
            return true;
        } catch {
            return false;
        }
    }

    subscribeToOutput(id: string, callback: (data: { type: string; data: string }) => void): (() => void) | null {
        const proc = this.processes.get(id);
        if (!proc) return null;

        proc.emitter.on('output', callback);
        return () => proc.emitter.off('output', callback);
    }

    subscribeToExit(id: string, callback: (data: { code: number | null }) => void): (() => void) | null {
        const proc = this.processes.get(id);
        if (!proc) return null;

        proc.emitter.on('exit', callback);
        return () => proc.emitter.off('exit', callback);
    }

    writeInput(id: string, data: string): boolean {
        const proc = this.processes.get(id);
        if (!proc || proc.exitCode !== null) return false;

        if (proc.isPty) {
            try {
                (proc.process as IPty).write(String(data ?? ''));
                return true;
            } catch {
                return false;
            }
        }

        const child = proc.process as ReturnType<typeof spawn>;
        if (child.stdin && !child.stdin.destroyed) {
            child.stdin.write(data);
            return true;
        }

        return false;
    }
}

export const scriptRunner = new ScriptRunner();
