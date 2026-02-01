# qq_group_leave

## Capability

- 退出指定群聊（或尝试解散群聊，取决于账号权限与协议支持）。

## Real-world impact

- 高风险群操作：会让机器人/账号离开群，可能导致后续无法继续在该群工作。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.leave`。

## When to use

- 用户明确要求退群，且你能拿到真实 `group_id`。

## When NOT to use

- `group_id` 不明确（不要猜）。
- 用户未确认退群/解散后果。

## Input

- Required:
  - `group_id` (number)
- Optional:
  - `dismiss` (boolean; default false)
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: `group_id` 非数字。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: 权限不足（例如无解散权限）或 WS 未连接。
