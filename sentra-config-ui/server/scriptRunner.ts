import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

interface ScriptProcess {
    id: string;
    name: 'bootstrap' | 'start' | 'napcat';
    process: ReturnType<typeof spawn>;
    output: string[];
    exitCode: number | null;
    startTime: Date;
    endTime: Date | null;
    emitter: EventEmitter;
}

export class ScriptRunner {
    private processes: Map<string, ScriptProcess> = new Map();
    
    private findRunningByName(name: ScriptProcess['name']): ScriptProcess | undefined {
        for (const p of this.processes.values()) {
            if (p.name === name && p.exitCode === null) return p;
        }
        return undefined;
    }

    executeScript(scriptName: 'bootstrap' | 'start' | 'napcat', args: string[] = []): string {
        // Enforce single instance per script
        const running = this.findRunningByName(scriptName);
        if (running) {
            return running.id; // Return existing running id
        }

        const id = `${scriptName}-${Date.now()}`;
        const emitter = new EventEmitter();

        const scriptPath = path.join(process.cwd(), 'scripts', `${scriptName}.mjs`);
        const proc = spawn('node', [scriptPath, ...args], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                FORCE_COLOR: '3',
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
            },
        });

        const scriptProcess: ScriptProcess = {
            id,
            name: scriptName,
            process: proc,
            output: [],
            exitCode: null,
            startTime: new Date(),
            endTime: null,
            emitter,
        };

        this.processes.set(id, scriptProcess);

        proc.stdout?.on('data', (data) => {
            const text = data.toString();
            scriptProcess.output.push(text);
            emitter.emit('output', { type: 'stdout', data: text });
        });

        proc.stderr?.on('data', (data) => {
            const text = data.toString();
            scriptProcess.output.push(text);
            emitter.emit('output', { type: 'stderr', data: text });
        });

        proc.on('close', (code) => {
            scriptProcess.exitCode = code;
            scriptProcess.endTime = new Date();
            emitter.emit('exit', { code });

            // Clean up after 5 minutes
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

        const pid = record.process.pid;
        if (!pid) return false;

        try {
            if (os.platform() === 'win32') {
                // Kill the entire process tree on Windows
                execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
            } else {
                // Try graceful first
                try { process.kill(pid, 'SIGTERM'); } catch {}
                // Fallback force kill if still alive after a short delay
                setTimeout(() => {
                    try { process.kill(pid, 'SIGKILL'); } catch {}
                }, 500);
            }
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
}

export const scriptRunner = new ScriptRunner();
