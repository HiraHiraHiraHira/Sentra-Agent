# qq_message_recall

## Capability

- 撤回指定 `message_id` 的 QQ 消息。

## Real-world impact

- 高风险消息操作：会影响真实聊天记录。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `message.recall`。

## When to use

- 用户明确要求撤回某条消息，且你能拿到真实 `message_id`（通常来自上游消息事件/日志/引用）。

## When NOT to use

- 拿不到真实 `message_id`（不要用占位符）。
- 消息可能已超出可撤回时间窗口（需要给用户预期）。

## Input

- Required:
  - `message_id` (number; 必须来自上下文)
- Optional:
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: `message_id` 非数字。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: 常见为权限不足、超出撤回时间窗口、或 WS 未连接。
