# qq_system_setOnlineStatus

## Capability

- 设置当前 QQ 账号的在线状态（如在线/离开/隐身等，可附加扩展状态）。

## Real-world impact

- 账号侧真实变更：会改变在线状态的对外展示。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `system.setOnlineStatus`。

## When to use

- 用户明确要求把账号改成“隐身/离开/忙碌/勿扰”等。
- 需要同时设置 `status/ext_status/battery_status`。

## When NOT to use

- 用户只说“改下状态”但没说具体想要哪种状态码。

## Input

- Required:
  - `status` (integer)
  - `ext_status` (integer)
  - `battery_status` (integer)

## Output

- `{ request, response }`

## Failure modes

- `INVALID`: 任一字段不是有效整数。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/机器人离线/状态码不支持。
