# qq_system_setDiyOnlineStatus

## Capability

- 设置当前 QQ 账号的自定义在线状态（表情/挂件 + 文案）。

## Real-world impact

- 账号侧真实变更：会修改在线状态展示（对外可见）。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `system.setDiyOnlineStatus`。

## When to use

- 用户明确要设置“自定义在线状态/小挂件/表情状态”。
- 已确定 `face_id`（表情 ID），可选附带 `wording`。

## When NOT to use

- 未提供 `face_id`（不要猜）。

## Input

- Required:
  - `face_id` (number|string)
- Optional:
  - `face_type` (number|string)
  - `wording` (string)

## Output

- `{ request, response }`

## Failure modes

- `INVALID`: 缺 `face_id`。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/机器人离线/不支持该 face_id。
