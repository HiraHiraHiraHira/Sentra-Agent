/**
 * PM2 生态配置文件
 * 用于管理 Sentra Agent 主进程
 */

module.exports = {
  apps: [
    {
      name: 'sentra-agent',
      script: './Main.js',
      interpreter: 'node',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        // Force color output for chalk/colorette under PM2 non-TTY
        FORCE_COLOR: '3',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      env_production: {
        NODE_ENV: 'production',
        FORCE_COLOR: '3',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      env_development: {
        NODE_ENV: 'development',
        FORCE_COLOR: '3',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 3000,
      instance_var: 'INSTANCE_ID',
      // Do not let PM2 add timestamps; the app already prints time
      // time: false (unset),
      append_env_to_name: false,
    }
  ]
};
