# qq_group_list

## Capability

- 获取当前账号加入的群列表。

## Real-world impact

- 只读查询：不修改群/成员。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.list`。

## When to use

- 需要列出“有哪些群可选”，用于后续选群发消息/管理。

## When NOT to use

- WS 服务未连接/机器人不在线时不要硬试。

## Input

- Optional:
  - `requestId` (string)

## Output

- `{ request, response }`：request 为 `group.list` 调用信息；response 为 WS 侧回包。

## Failure modes

- `ERR`: WS 未连接/QQ 侧异常。
