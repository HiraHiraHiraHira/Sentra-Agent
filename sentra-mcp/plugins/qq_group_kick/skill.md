# qq_group_kick

## Capability

- 将指定 `user_id` 从指定 `group_id` 中移除（踢人）。

## Real-world impact

- 高风险群管理操作：会影响真实群成员。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.kick`。

## When to use

- 用户明确要求把某个群成员移出群聊，且你能拿到真实群号与 QQ 号。

## When NOT to use

- 拿不到真实 `group_id/user_id`（不要猜号）。
- 用户没有明确同意/指向对象不明确（“把他踢了”但不知道是谁）。

## Input

- Required:
  - `group_id` (number)
  - `user_id` (number)
- Optional:
  - `reject` (boolean): 是否拒绝再次加群（视平台实现）
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: `group_id/user_id` 不是有效数字。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: 常见为权限不足（机器人非管理员/群主）或 WS 未连接。
