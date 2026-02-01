# qq_account_getQQProfile

## Capability

- 查询一个或多个 QQ 号的个人资料信息（单个或批量）。

## Real-world impact

- 只读查询：不修改账号资料。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `user.info`。

## When to use

- 想了解某个 QQ 用户的公开资料信息（昵称、等级等，具体字段取决于 WS 回包）。
- 需要批量查询多个 QQ 号。

## When NOT to use

- 用户没给出 QQ 号（不要猜 user_id）。

## Input

- Provide one of:
  - `user_id` (number)
  - `user_ids` (number[])
- Optional:
  - `refresh` (boolean): 是否强制刷新（传给 WS）
  - `requestId` (string)

## Output

- 单个：`{ request, response }`
- 批量：`{ mode: 'batch', results: [{ user_id, success, data|error }] }`

## Failure modes

- `INVALID`: 缺 `user_id/user_ids`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/账号状态异常。
