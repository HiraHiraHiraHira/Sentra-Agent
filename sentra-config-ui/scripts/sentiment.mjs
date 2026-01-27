import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import boxen from 'boxen';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo root is one level above sentra-config-ui
const repoRoot = path.resolve(__dirname, '..', '..');
const pm2AppName = 'sentra-emo';
const emoDir = path.join(repoRoot, 'sentra-emo');
const logsDir = path.join(repoRoot, 'logs');
const ecosystem = path.join(repoRoot, 'ecosystem.config.cjs');

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
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

function readDotenvFile(filePath) {
  try {
    if (!exists(filePath)) return {};
    const txt = fs.readFileSync(filePath, 'utf8');
    const out = {};
    for (const rawLine of txt.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function resolveEmoPort(childEnv) {
  const envPort = childEnv?.APP_PORT || process.env.APP_PORT;
  const fromEnv = Number(envPort);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.trunc(fromEnv);
  const emoDotenv = readDotenvFile(path.join(emoDir, '.env'));
  const fromFile = Number(emoDotenv.APP_PORT);
  if (Number.isFinite(fromFile) && fromFile > 0) return Math.trunc(fromFile);
  return 7200;
}

function findWindowsListeningPidsByPort(port) {
  try {
    const r = spawnSync('netstat', ['-ano'], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });
    if (r.status !== 0) return [];
    const out = String(r.stdout || '');
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      if (!/\bLISTENING\b/i.test(s)) continue;
      const parts = s.split(/\s+/);
      const local = parts[1] || '';
      if (!local.endsWith(`:${port}`) && !local.endsWith(`.${port}`)) continue;
      const pidStr = parts[parts.length - 1];
      const pid = Number(pidStr);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    return Array.from(pids);
  } catch {
    return [];
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function windowsGetProcessImageName(pid) {
  try {
    const r = spawnSync('tasklist', ['/FO', 'CSV', '/NH', '/FI', `PID eq ${pid}`], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });
    if (r.status !== 0) return '';
    const out = String(r.stdout || '');
    const line = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('"'));
    if (!line) return '';
    const fields = parseCsvLine(line);
    return String(fields[0] || '').trim();
  } catch {
    return '';
  }
}

function windowsGetProcessCommandLine(pid) {
  try {
    const cmd = `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', cmd], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });
    if (r.status !== 0) return '';
    return String(r.stdout || '').trim();
  } catch {
    return '';
  }
}

function findUnixListeningPidsByPort(port) {
  try {
    if (commandExists('lsof', ['-v'])) {
      const r = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });
      if (r.status !== 0) return [];
      return String(r.stdout || '')
        .split(/\r?\n/)
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    if (commandExists('ss', ['--version'])) {
      const r = spawnSync('ss', ['-ltnp'], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });
      if (r.status !== 0) return [];
      const out = String(r.stdout || '');
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const s = line.trim();
        if (!s) continue;
        if (!s.includes(`:${port}`)) continue;
        const m = s.match(/pid=(\d+)/g);
        if (!m) continue;
        for (const mm of m) {
          const n = Number(mm.replace('pid=', ''));
          if (Number.isFinite(n) && n > 0) pids.add(n);
        }
      }
      return Array.from(pids);
    }
    return [];
  } catch {
    return [];
  }
}

function unixGetProcessInfo(pid) {
  try {
    const comm = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });
    const args = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });
    return {
      comm: String(comm.stdout || '').trim(),
      args: String(args.stdout || '').trim(),
    };
  } catch {
    return { comm: '', args: '' };
  }
}

function windowsKillPid(pid) {
  try {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    return r.status === 0;
  } catch {
    return false;
  }
}

async function ensurePortFreeBeforeStart(port) {
  const isWin = process.platform === 'win32';
  const pids = isWin ? findWindowsListeningPidsByPort(port) : findUnixListeningPidsByPort(port);
  if (!pids.length) return;

  for (const pid of pids) {
    if (isWin) {
      const imgRaw = windowsGetProcessImageName(pid);
      const cmdRaw = windowsGetProcessCommandLine(pid);
      const img = String(imgRaw || '').toLowerCase();
      const cmd = String(cmdRaw || '').toLowerCase();
      const allowedByImg = img.includes('python') || img.includes('uv');
      const allowedByCmd = cmd.includes('sentra-emo') || cmd.includes('run.py') || cmd.includes('uvicorn');
      if (!allowedByImg && !allowedByCmd) {
        throw new Error(`Port ${port} is already in use by PID ${pid} (${img || 'unknown'}). Please close that process or change APP_PORT, then retry.`);
      }
      windowsKillPid(pid);
    } else {
      const info = unixGetProcessInfo(pid);
      const comm = String(info.comm || '').toLowerCase();
      const args = String(info.args || '').toLowerCase();
      const allowedByComm = comm.includes('python') || comm.includes('uv') || comm.includes('node');
      const allowedByArgs = args.includes('sentra-emo') || args.includes('run.py') || args.includes('uvicorn');
      if (!allowedByComm && !allowedByArgs) {
        throw new Error(`Port ${port} is already in use by PID ${pid} (${info.comm || 'unknown'}). Please close that process or change APP_PORT, then retry.`);
      }
      try { process.kill(pid, 'SIGTERM'); } catch { }
      setTimeout(() => { try { process.kill(pid, 'SIGKILL'); } catch { } }, 500);
    }
  }

  for (let i = 0; i < 8; i++) {
    const remain = isWin ? findWindowsListeningPidsByPort(port) : findUnixListeningPidsByPort(port);
    if (!remain.length) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  const remain = isWin ? findWindowsListeningPidsByPort(port) : findUnixListeningPidsByPort(port);
  if (remain.length) {
    throw new Error(`Port ${port} is still in use after cleanup attempt (PIDs: ${remain.join(', ')}). Please close the occupying process manually.`);
  }
}

function resolveRunner() {
  return commandExists('uv', ['--version']) ? 'uv' : 'python';
}

function quotePath(p) {
  // Always quote paths to handle spaces and Chinese characters
  return JSON.stringify(p);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))));
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { cmd: 'start', env: 'production', logs: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['start', 'pm2-start', 'pm2-logs', 'pm2-stop', 'pm2-delete', 'pm2-restart', 'pm2-status'].includes(a)) out.cmd = a;
    else if (a.startsWith('--env=')) out.env = a.split('=')[1];
    else if (a === '--env' && args[i + 1]) out.env = args[++i];
    else if (a === '--no-logs') out.logs = false;
  }
  return out;
}

function resolvePm2Bin() {
  const isWin = process.platform === 'win32';
  if (commandExists('pm2', ['--version'])) return 'pm2';
  const local = path.join(__dirname, '..', 'node_modules', '.bin', isWin ? 'pm2.cmd' : 'pm2');
  if (fs.existsSync(local) && commandExists(local, ['--version'])) return local;
  return 'pm2';
}

function getPm2Process(pm2Bin, name) {
  try {
    const r = spawnSync(pm2Bin, ['jlist'], { stdio: ['ignore', 'pipe', 'ignore'], shell: true });
    if (r.status !== 0) return null;
    const out = String(r.stdout || '');
    const list = JSON.parse(out);
    if (!Array.isArray(list)) return null;
    return list.find((p) => p && p.name === name) || null;
  } catch {
    return null;
  }
}

function ensureLogsDir() {
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch { }
}

async function pm2Recreate(pm2Bin, env) {
  ensureLogsDir();
  const existing = getPm2Process(pm2Bin, pm2AppName);
  if (existing) {
    await run(pm2Bin, ['delete', pm2AppName], { cwd: repoRoot });
  }

  const runner = resolveRunner();
  const reload = String(env || 'production').toLowerCase() === 'development' ? '1' : '0';
  const childEnv = {
    ...process.env,
    FORCE_COLOR: process.env.FORCE_COLOR || '3',
    TERM: process.env.TERM || 'xterm-256color',
    COLORTERM: process.env.COLORTERM || 'truecolor',
    PYTHONUNBUFFERED: process.env.PYTHONUNBUFFERED || '1',
    UVICORN_RELOAD: reload,
  };

  const port = resolveEmoPort(childEnv);
  await ensurePortFreeBeforeStart(port);

  if (process.platform === 'win32' && exists(ecosystem)) {
    const args = ['start', quotePath(ecosystem), '--only', pm2AppName];
    if (env) args.push('--env', env);
    await run(pm2Bin, args, { cwd: repoRoot, env: childEnv });
    return;
  }

  const outLog = path.join(logsDir, 'pm2-emo-out.log');
  const errLog = path.join(logsDir, 'pm2-emo-error.log');

  if (runner === 'uv') {
    await run(
      pm2Bin,
      ['start', 'uv', '--interpreter', 'none', '--name', pm2AppName, '-o', quotePath(outLog), '-e', quotePath(errLog), '--merge-logs', '--', 'run', 'python', 'run.py'],
      { cwd: emoDir, env: childEnv },
    );
  } else {
    await run(
      pm2Bin,
      ['start', 'python', '--interpreter', 'none', '--name', pm2AppName, '-o', quotePath(outLog), '-e', quotePath(errLog), '--merge-logs', '--', 'run.py'],
      { cwd: emoDir, env: childEnv },
    );
  }
}

async function main() {
  const { cmd, env, logs } = parseArgs();
  const pm2Bin = resolvePm2Bin();
  if (!commandExists(pm2Bin, ['--version']) && pm2Bin === 'pm2') {
    throw new Error('pm2 not found in PATH and local node_modules/.bin/pm2 is missing');
  }

  if (cmd === 'pm2-status') {
    console.log(boxen(chalk.bold.blue('Sentra-Emo: pm2 status'), { padding: 1, borderStyle: 'round' }));
    await run(pm2Bin, ['status'], { cwd: repoRoot });
    return;
  }

  if (cmd === 'pm2-logs') {
    console.log(boxen(chalk.bold.blue(`Sentra-Emo: pm2 logs (${pm2AppName})`), { padding: 1, borderStyle: 'round' }));
    await run(pm2Bin, ['logs', pm2AppName], { cwd: repoRoot });
    return;
  }

  if (cmd === 'pm2-stop') {
    console.log(boxen(chalk.bold.blue(`Sentra-Emo: pm2 stop (${pm2AppName})`), { padding: 1, borderStyle: 'round' }));
    await run(pm2Bin, ['stop', pm2AppName], { cwd: repoRoot });
    return;
  }

  if (cmd === 'pm2-delete') {
    console.log(boxen(chalk.bold.blue(`Sentra-Emo: pm2 delete (${pm2AppName})`), { padding: 1, borderStyle: 'round' }));
    await run(pm2Bin, ['delete', pm2AppName], { cwd: repoRoot });
    return;
  }

  if (cmd === 'pm2-restart') {
    console.log(boxen(chalk.bold.blue(`Sentra-Emo: pm2 restart (${pm2AppName})`), { padding: 1, borderStyle: 'round' }));
    await run(pm2Bin, ['restart', pm2AppName, '--update-env'], { cwd: repoRoot });
    if (logs) await run(pm2Bin, ['logs', pm2AppName], { cwd: repoRoot });
    return;
  }

  if (cmd === 'pm2-start' || cmd === 'start') {
    console.log(boxen(chalk.bold.cyan(`Sentra-Emo: pm2 start (recreate)`), { padding: 1, borderStyle: 'round' }));
    await pm2Recreate(pm2Bin, env);
    if (logs) await run(pm2Bin, ['logs', pm2AppName], { cwd: repoRoot });
    return;
  }
}

main().catch((e) => {
  console.error(chalk.red.bold('Error: ') + (e.message || e));
  process.exit(1);
});
