# qq_account_setSelfLongnick

## Capability

- 设置当前 QQ 账号的个性签名（长签）为指定文本。

## Real-world impact

- 高影响账号资料操作：会修改真实账号签名。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `account.setSelfLongnick`。

## When to use

- 用户明确要求把签名改成某段文案，并给出完整文案。

## When NOT to use

- 没有 `longNick` 文案或用户未确认。

## Input

- Required:
  - `longNick` (string)
- Optional:
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: 缺 `longNick`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接或平台拒绝该签名。
