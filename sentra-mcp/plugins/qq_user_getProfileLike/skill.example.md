# qq_user_getProfileLike

## Capability

- 获取当前账号“资料点赞/名片赞”相关信息。

## Real-world impact

- 只读查询：不写本地文件、不修改外部状态。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `user.getProfileLike`。

## When to use

- 用户要查看当前账号收到/拥有的资料点赞情况（以 WS 回包字段为准）。

## When NOT to use

- WS 服务未连接/机器人不在线时不要硬试。

## Input

- Optional:
  - `requestId` (string)

## Output

- `{ request, response }`：request 为 `user.getProfileLike` 调用信息；response 为 WS 回包。

## Failure modes

- `ERR`: WS 未连接/QQ 侧异常。
