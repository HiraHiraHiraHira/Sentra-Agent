# qq_user_sendLike

## Capability

- 给指定 QQ 账号发送资料点赞（可指定次数）。

## Real-world impact

- 真实互动行为：会对目标账号产生点赞。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `user.sendLike`。

## When to use

- 用户明确要求“给 TA 点赞/点几下”。
- 你能拿到真实 `user_id`。

## When NOT to use

- 不要在用户未同意的情况下对陌生账号频繁点赞（可能触发风控）。

## Input

- Required:
  - `user_id` (number)
  - `times` (number)
- Optional:
  - `requestId` (string)

## Output

- `{ request, response }`

## Failure modes

- `INVALID`: `user_id` 或 `times` 非数字。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/触发频率限制/账号状态异常。
