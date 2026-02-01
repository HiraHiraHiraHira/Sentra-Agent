# qq_group_memberInfo

## Capability

- 查询指定群内成员信息（单成员或批量）。

## Real-world impact

- 只读查询：不修改群/成员。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.memberInfo`。

## When to use

- 已知群号与成员 QQ 号，想查该成员的群内资料（具体字段取决于 WS 侧回包）。

## When NOT to use

- 缺 `group_id`，或缺 `user_id/user_ids`（不要猜成员号）。

## Input

- Required:
  - `group_id` (number)
  - `user_id` (number) or `user_ids` (number[])
- Optional:
  - `refresh` (boolean): 是否强制刷新（传给 WS）
  - `requestId` (string)

## Output

- 单个成员：`{ request, response }`
- 批量：`{ mode: 'batch', results: [{ group_id, user_id, success, data|error }] }`

## Failure modes

- `INVALID`: 缺 `group_id` 或缺 `user_id/user_ids`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/机器人不在群内/权限或参数问题。
