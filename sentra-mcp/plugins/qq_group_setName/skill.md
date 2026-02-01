# qq_group_setName

## Capability

- 修改指定 `group_id` 的群名称为 `name`。

## Real-world impact

- 高风险群管理操作：会修改真实群资料。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.setName`。

## When to use

- 用户明确要求改群名，并提供新群名。

## When NOT to use

- 群号不明确或新群名不明确。
- 机器人无群管理权限。

## Input

- Required:
  - `group_id` (number)
  - `name` (string)
- Optional:
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: `group_id` 非数字或缺 `name`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: 权限不足或 WS 未连接。
