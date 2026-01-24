import { spawn, execSync } from 'child_process';

process.env.NODE_ENV = 'production';


let isCleaning = false;

function cleanup() {
  if (isCleaning) return;
  isCleaning = true;

  console.log('\n正在清理 PM2 进程...');
  try {
    execSync('npm run pm2:stop', { stdio: 'ignore' });
    execSync('npm run pm2:delete', { stdio: 'ignore' });
    console.log('清理完毕');
  } catch (e) {

  }
}

process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
process.on('SIGHUP', () => process.exit());

process.on('exit', cleanup);

console.log('正在启动服务...');
try {
  execSync('npm run pm2:start', { stdio: 'inherit' });
  execSync('npm run pm2:status', { stdio: 'inherit' });
} catch (err) {
  console.error('启动失败');
  process.exit(1);
}

console.log('\n正在查看实时日志... (按下 Ctrl+C 或关闭窗口后将自动停止服务)');
console.log('退出时会自动清理 PM2 实例\n');

const logs = spawn('npm', ['run', 'pm2:logs'], { 
  stdio: 'inherit', 
  shell: true 
});

logs.on('close', () => {
  process.exit();
});