# qq_system_getUserStatus

## Capability

- 查询一个或多个 QQ 号的在线状态（单个或批量）。

## Real-world impact

- 只读查询：不修改任何数据。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `system.getUserStatus`。

## When to use

- 用户要查某个 QQ 是否在线，或需要批量检查多个账号状态。

## When NOT to use

- 用户没有给出 QQ 号（不要猜 user_id）。

## Input

- Provide one of:
  - `user_id` (number)
  - `user_ids` (number[])
- Optional:
  - `requestId` (string)

## Output

- 单个：`{ request, response }`
- 批量：`{ mode: 'batch', results: [{ user_id, success, data|error }] }`

## Failure modes

- `INVALID`: 缺 `user_id/user_ids`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/权限或账号状态问题。
