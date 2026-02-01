# qq_user_sendPoke

## Capability

- 发送“戳一戳”（可私聊戳、也可在群内戳指定目标）。

## Real-world impact

- 真实互动行为：会对目标用户触发戳一戳。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `user.sendPoke`。
- 可能触发频率限制；插件支持间隔与失败重试（由插件 `.env` 控制）。

## When to use

- 用户明确要求“戳一下/戳几下”。
- 需要在群里戳人时：提供 `group_id`，可选 `target_id`。

## When NOT to use

- 不要在用户未授权情况下骚扰式连续戳。

## Input

- Required:
  - `user_id` (string): 接收者 QQ 号
- Optional:
  - `group_id` (string): 群号（不填则按私聊戳）
  - `target_id` (string): 群内戳的目标 QQ 号（不填默认戳 `user_id`）
  - `times` (integer 1-5; default 1)
  - `requestId` (string)

## Output

- 成功时（至少一次成功）：`success=true`，`code` 可能为 `OK` 或 `PARTIAL_SUCCESS`。
- 返回 `data` 内包含：
  - `总次数`/`成功次数`/`失败次数`/`总尝试数`
  - `配置`（间隔时间、失败重试配置）
  - `request`（sdk path/args）
  - `results`（每轮每次尝试的明细）

## Failure modes

- `INVALID`: 缺 `user_id`。
- `TIMEOUT`: 全部轮次失败且包含超时特征。
- `ALL_FAILED`: 所有轮次都失败（通常是 WS/权限/风控/参数不支持）。
