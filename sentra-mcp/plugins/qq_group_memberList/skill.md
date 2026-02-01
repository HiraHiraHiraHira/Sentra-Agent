# qq_group_memberList

## Capability

- 获取群成员列表（单群或批量）。

## Real-world impact

- 只读查询：不修改群/成员。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.memberList`。

## When to use

- 需要枚举群成员（用于后续筛选、查成员信息、统计等）。

## When NOT to use

- 群号不明确（不要猜 group_id）。

## Input

- Provide one of:
  - `group_id` (number)
  - `group_ids` (number[])
- Optional:
  - `requestId` (string)

## Output

- 单个群：`{ request, response }`
- 批量：`{ mode: 'batch', results: [{ group_id, success, data|error }] }`

## Failure modes

- `INVALID`: 缺 `group_id/group_ids`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/机器人不在群内/权限或参数问题。
