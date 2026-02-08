# qq_user_deleteFriend

## Capability

- 删除指定 `user_id` 的 QQ 好友关系（不可逆）。

## Real-world impact

- 高风险不可逆操作：会删除真实好友关系。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `user.deleteFriend`。

## When to use

- 用户明确表示要删除某个好友，并且你能拿到真实 QQ 号。

## When NOT to use

- `user_id` 不明确或用户没有二次确认。

## Input

- Required:
  - `user_id` (number)
- Optional:
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: `user_id` 非数字。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接、权限/关系状态异常。
