# qq_account_setQQProfile

## Capability

- 修改当前 QQ 账号个人资料（`nickname`/`personal_note`/`sex`）。

## Real-world impact

- 高影响账号资料操作：会修改真实账号资料。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `account.setQQProfile`。

## When to use

- 用户明确要求修改昵称/签名/性别，并提供目标内容。

## When NOT to use

- 用户没有给出要改成什么（至少要提供一个字段）。
- 用户未确认要修改账号资料。

## Input

- Provide at least one:
  - `nickname` (string)
  - `personal_note` (string)
  - `sex` (string enum: "0"|"1"|"2")
- Optional:
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含 payload；response 为 WS 侧回包。

## Failure modes

- `INVALID`: 未提供任何字段，或 `sex` 非法。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接或平台拒绝该资料变更。
