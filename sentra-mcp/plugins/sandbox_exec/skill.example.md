# sandbox_exec

## 功能

- 在受控“终端沙箱(PTY)”中执行一条命令（非交互）
- 执行过程会流式输出（适合前端实时展示）
- 默认联动 sentra-config-ui 的 Terminal Executor（/api/terminal-executor + WebSocket）

## 实际影响

- 会在运行环境中启动一个新的终端会话并执行命令
- 可能产生文件写入、网络访问、依赖安装等副作用（取决于 cmd）

## 使用场景

- 需要执行一次性脚本并实时看到输出（例如：打印环境信息、跑构建、跑测试、执行 git/cli 命令）
- 需要将输出粘贴回对话中用于后续决策

## 禁止场景

- 用户未明确同意执行可能有破坏性的命令（rm/del/格式化磁盘/覆盖重要文件/上传敏感信息等）
- 需要强交互的操作（例如需要持续输入密码、需要长时间手动选择菜单）

## 输入

- 必填：
  - `cmd`：要执行的命令（非交互）
- 可选：
  - `terminalType`：终端类型（`powershell`/`cmd`/`bash`/`zsh`/`sh`）。不传则回退环境变量 `SANDBOX_EXEC_TERMINAL_TYPE`
  - `cwd`：工作目录（建议绝对路径）
  - `timeoutMs`：超时时间（毫秒），到期会尝试结束
  - `expectExit`：是否期望命令自然退出（默认 true）。
    - 对于持续输出命令（例如 `pm2 logs`、`tail -f`），应当设为 false，并用 `timeoutMs` 控制“拉取一段输出后返回”。
  - `stopSignal`：当 `expectExit=false` 且到达 `timeoutMs` 时如何停止（默认 `ctrl_c`）
  - `closeOnFinish`：执行结束后是否自动关闭会话（默认 true）
  - `stripAnsi`：是否清理 ANSI 转义序列（颜色/光标控制等），默认 true。设为 false 可保留原始终端转义码。
  - `encoding`：输出编码，默认 utf-8。Windows cmd/powershell 可能需要 gbk。
  - `maxOutputChars`：最大输出字符数，超出会裁剪保留最后部分。0 表示不限制。
  - `tailLines`：只返回最后 N 行。0 表示不限制。优先于 maxOutputChars。

## 常见坑（非常重要）

- `pm2 logs` 默认会持续跟随日志，不会退出。
  - 优先方案：如果你的 pm2 支持 `--nostream`，用它来“打印后退出”。
  - 通用方案：使用 `expectExit=false` + 较小的 `timeoutMs`（例如 3000-8000ms）来抓取最近输出并返回。

## 环境变量（回退）

- `SANDBOX_EXEC_CONFIG_UI_BASE_URL`：sentra-config-ui 服务地址（默认 http://127.0.0.1:7245）
- `SANDBOX_EXEC_SECURITY_TOKEN`：sentra-config-ui 的安全 token（必须配置）
- `SANDBOX_EXEC_TERMINAL_TYPE`：默认终端类型（可选）

## 输出

- `{ sessionId, terminalType, cwd, cmd, exited, exitCode, signal, output }`

## 失败模式

- `CONFIG`：缺少 `SANDBOX_EXEC_SECURITY_TOKEN` 或 config-ui 不可用
- `TIMEOUT`：命令执行超时
- `ERR`：WebSocket/命令执行失败
