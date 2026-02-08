# qq_message_recentContact

## Capability

- 获取最近联系人/最近会话列表（用于选择私聊对象或群）。

## Real-world impact

- 只读查询：不修改任何数据。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `message.recentContact`。

## When to use

- 用户说“最近聊过的人/最近会话有哪些”，或需要从最近会话里找目标 id。

## When NOT to use

- WS 服务未连接/机器人不在线时不要硬试。

## Input

- Optional:
  - `requestId` (string)

## Output

- `{ request, response }`：request 为 `message.recentContact` 调用信息；response 为 WS 侧回包。

## Failure modes

- `ERR`: WS 未连接/QQ 侧异常。
