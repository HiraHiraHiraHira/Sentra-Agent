import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiDir, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { pm: 'auto', py: 'auto', force: false, dryRun: false, only: 'all', pipIndex: process.env.PIP_INDEX_URL || '' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--force') out.force = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--pm=')) out.pm = a.split('=')[1];
    else if (a === '--pm' && args[i + 1]) { out.pm = args[++i]; }
    else if (a.startsWith('--py=')) out.py = a.split('=')[1];
    else if (a === '--py' && args[i + 1]) { out.py = args[++i]; }
    else if (a.startsWith('--only=')) out.only = a.split('=')[1];
    else if (a === '--only' && args[i + 1]) { out.only = args[++i]; }
    else if (a.startsWith('--pip-index=')) out.pipIndex = a.split('=')[1];
    else if (a === '--pip-index' && args[i + 1]) { out.pipIndex = args[++i]; }
    else if (a === '--help' || a === '-h') {
      console.log(chalk.cyan('Usage: node scripts/bootstrap.mjs [--pm pnpm|npm|cnpm] [--py uv|venv] [--only all|node|python] [--force] [--dry-run] [--pip-index <url>]'));
      process.exit(0);
    }
  }
  return out;
}

function commandExists(cmd, checkArgs = ['--version']) {
  try {
    const r = spawnSync(cmd, checkArgs, { stdio: 'ignore', shell: true });
    return r.status === 0;
  } catch {
    return false;
  }
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function listSentraSubdirs(root) {
  const out = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith('sentra-')) {
      out.push(path.join(root, e.name));
    }
  }
  return out;
}

function isNodeProject(dir) {
  return exists(path.join(dir, 'package.json'));
}

function isNodeInstalled(dir) {
  return exists(path.join(dir, 'node_modules'));
}

function choosePM(preferred) {
  if (preferred && preferred !== 'auto') {
    if (!commandExists(preferred)) throw new Error(`Package manager ${preferred} not found in PATH`);
    return preferred;
  }
  if (commandExists('pnpm')) return 'pnpm';
  if (commandExists('npm')) return 'npm';
  if (commandExists('cnpm')) return 'cnpm';
  throw new Error('No package manager found. Please install pnpm or npm or cnpm, or pass --pm option.');
}

async function installNode(dir, pm, dryRun) {
  const label = path.relative(repoRoot, dir) || '.';
  const spinner = ora(`Installing dependencies for ${chalk.bold(label)}...`).start();

  if (dryRun) {
    spinner.info(chalk.yellow(`[DRY] ${pm} install @ ${label}`));
    return;
  }

  try {
    await run(pm, ['install'], dir);
    spinner.succeed(chalk.green(`Installed dependencies for ${label}`));
  } catch (e) {
    spinner.fail(chalk.red(`Failed to install dependencies for ${label}`));
    throw e;
  }
}

async function ensureNodeProjects(pm, force, dryRun) {
  console.log(boxen(chalk.bold.blue('Node.js Dependencies'), { padding: 1, borderStyle: 'round' }));

  const projects = new Set();
  projects.add(repoRoot);
  projects.add(uiDir);
  for (const dir of listSentraSubdirs(repoRoot)) {
    if (isNodeProject(dir)) projects.add(dir);
  }
  const results = [];
  for (const dir of projects) {
    if (!isNodeProject(dir)) continue;
    const installed = isNodeInstalled(dir);
    results.push({ dir, installed });
  }
  for (const r of results) {
    if (!r.installed || force) {
      await installNode(r.dir, pm, dryRun);
    } else {
      const label = path.relative(repoRoot, r.dir) || '.';
      console.log(chalk.gray(`[Node] Skipped (already installed) @ ${label}`));
    }
  }
}

function venvPythonPath(venvDir) {
  return process.platform === 'win32' ? path.join(venvDir, 'Scripts', 'python.exe') : path.join(venvDir, 'bin', 'python');
}

function detectPython() {
  const cands = [
    { cmd: 'python3', args: [] },
    { cmd: 'python', args: [] },
    { cmd: 'py', args: ['-3'] },
    { cmd: 'py', args: [] }
  ];
  for (const c of cands) {
    try {
      const r = spawnSync(c.cmd, [...c.args, '-V'], { stdio: 'ignore', shell: true });
      if (r.status === 0) return c;
    } catch { }
  }
  return null;
}

function hasUv() {
  return commandExists('uv');
}

async function installRequirementsWithFallback(vpy, emoDir, pipIndex, dryRun) {
  const attempts = [];
  const basePipArgs = ['-m', 'pip', 'install', '-r', 'requirements.txt', '--retries', '3', '--timeout', '60'];
  if (pipIndex) {
    attempts.push({
      cmd: vpy,
      args: [...basePipArgs, '-i', pipIndex, '--extra-index-url', 'https://pypi.org/simple'],
      label: `pip (-i ${pipIndex} + extra-index pypi.org)`
    });
  }
  attempts.push({
    cmd: vpy,
    args: [...basePipArgs, '-i', 'https://pypi.org/simple'],
    label: 'pip (official pypi.org)'
  });
  if (hasUv()) {
    attempts.push({
      cmd: 'uv',
      args: ['pip', 'install', '-r', 'requirements.txt', '--python', vpy, '--index-url', (pipIndex || 'https://pypi.org/simple')],
      label: 'uv pip (--python venv)'
    });
  }

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const spinner = ora(`Attempt ${i + 1}/${attempts.length}: ${a.label}`).start();

    if (dryRun) {
      spinner.info(chalk.yellow(`[DRY] Attempt ${i + 1}/${attempts.length}: ${a.label}`));
      continue;
    }

    try {
      await run(a.cmd, a.args, emoDir);
      spinner.succeed(chalk.green(`Success: ${a.label}`));
      return; // success
    } catch (err) {
      spinner.fail(chalk.red(`Failed: ${a.label}`));
      if (i === attempts.length - 1) throw err;
    }
  }
}

async function ensureEmoPython(pyChoice, pipIndex, force, dryRun) {
  console.log('\n' + boxen(chalk.bold.yellow('Python Environment'), { padding: 1, borderStyle: 'round' }));

  const emoDir = path.join(repoRoot, 'sentra-emo');
  const req = path.join(emoDir, 'requirements.txt');
  if (!exists(emoDir) || !exists(req)) {
    console.log(chalk.gray('[Python] sentra-emo not found or requirements.txt missing, skipped'));
    return;
  }
  const venvDir = path.join(emoDir, '.venv');
  const needCreate = force || !exists(venvDir);

  if (needCreate) {
    const spinner = ora('Creating virtual environment...').start();
    if (dryRun) {
      spinner.info(chalk.yellow(`[DRY] Create Python venv @ ${path.relative(repoRoot, emoDir)}`));
    } else {
      try {
        if ((pyChoice === 'uv' || pyChoice === 'auto') && commandExists('uv')) {
          await run('uv', ['venv', '.venv'], emoDir);
        } else {
          const py = detectPython();
          if (!py) throw new Error('No Python found. Please install Python 3 or install uv.');
          await run(py.cmd, [...py.args, '-m', 'venv', '.venv'], emoDir);
        }
        spinner.succeed(chalk.green('Virtual environment created'));
      } catch (e) {
        spinner.fail(chalk.red('Failed to create virtual environment'));
        throw e;
      }
    }
  }

  const vpy = venvPythonPath(venvDir);
  if (!exists(vpy)) {
    throw new Error('Virtualenv python not found. Creation may have failed.');
  }

  if (dryRun) {
    console.log(chalk.yellow(`[DRY] Upgrade pip & install requirements`));
    return;
  }

  try {
    await run(vpy, ['-m', 'pip', 'install', '--upgrade', 'pip', '-i', 'https://pypi.org/simple'], emoDir);
  } catch { }

  console.log(chalk.blue('Installing requirements for sentra-emo...'));
  await installRequirementsWithFallback(vpy, emoDir, pipIndex, false);
}

async function main() {
  console.log(chalk.bold.magenta('🚀 Sentra Agent Bootstrap'));
  const opts = parseArgs();
  const pm = choosePM(opts.pm);

  if (opts.only === 'all' || opts.only === 'node') {
    await ensureNodeProjects(pm, opts.force, opts.dryRun);
  }
  if (opts.only === 'all' || opts.only === 'python') {
    await ensureEmoPython(opts.py, opts.pipIndex, opts.force, opts.dryRun);
  }
  console.log('\n' + chalk.green.bold('✨ Setup completed successfully!'));
}

main().catch((e) => {
  console.error(chalk.red.bold('Error: ') + (e.message || e));
  process.exit(1);
});
