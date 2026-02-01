# qq_group_info

## Capability

- 查询群信息（单群或批量）。

## Real-world impact

- 只读查询：不修改群/成员。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.info`。

## When to use

- 需要获取群资料（群名、人数等，具体字段取决于 WS 侧回包）。
- 需要批量查询多个群。

## When NOT to use

- 群号不明确（不要猜 group_id）。

## Input

- Provide one of:
  - `group_id` (number)
  - `group_ids` (number[])
- Optional:
  - `refresh` (boolean): 是否强制刷新（传给 WS）
  - `requestId` (string)

## Output

- 单个群：`{ request, response }`
- 批量：`{ mode: 'batch', results: [{ group_id, success, data|error }] }`

## Failure modes

- `INVALID`: 缺 `group_id/group_ids`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/机器人不在群内/权限或参数问题。
