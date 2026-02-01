# qq_account_setQQAvatar

## Capability

- 将当前 QQ 账号头像更换为指定图片文件。

## Real-world impact

- 高影响账号资料操作：会修改真实账号头像。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `account.setQQAvatar`。
- 读取本地文件：`file` 必须是可访问的本地绝对路径。

## When to use

- 用户明确要求更换头像，并提供了头像图片的本地绝对路径。

## When NOT to use

- 没有本地图片路径（不要猜文件名/相对路径）。
- 用户没有确认要改头像。

## Input

- Required:
  - `file` (string; 本地绝对路径)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: 缺 `file`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: 文件路径不可用/格式不支持/WS 未连接。
