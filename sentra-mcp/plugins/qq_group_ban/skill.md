# qq_group_ban

## Capability

- 对指定 `group_id` 内的指定 `user_id` 设置禁言时长（秒）。

## Real-world impact

- 高风险群管理操作：会影响真实用户发言权限。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.ban`。

## When to use

- 用户明确要求“禁言某人 X 分钟/到某时间”，且你能拿到真实群号与 QQ 号。

## When NOT to use

- 拿不到真实 `group_id/user_id` 或禁言时长不明确。
- 用户意图不明确/可能误伤对象。

## Input

- Required:
  - `group_id` (number)
  - `user_id` (number)
- Optional:
  - `duration` (number, seconds; default 600)
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: `group_id/user_id` 非数字。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: 常见为权限不足（机器人非管理员/群主）或 WS 未连接。
