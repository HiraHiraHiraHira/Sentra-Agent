# qq_group_setCard

## Capability

- 设置指定群中指定成员的群名片（备注名/群昵称）。

## Real-world impact

- 高风险群管理操作：会修改真实成员名片信息。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.setCard`。

## When to use

- 用户明确要求修改某成员的群名片，并提供群号、成员 QQ 号和目标名片文本。

## When NOT to use

- 任一参数不明确（不要猜 `group_id/user_id`）。
- 机器人无权限修改名片。

## Input

- Required:
  - `group_id` (number)
  - `user_id` (number)
  - `card` (string)
- Optional:
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: 参数缺失或不是有效数字。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: 权限不足或 WS 未连接。
