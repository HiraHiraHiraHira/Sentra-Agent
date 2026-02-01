# qq_system_setModelShow

## Capability

- 设置当前 QQ 账号的设备/模型展示信息（对外可见文案）。

## Real-world impact

- 账号侧真实变更：会修改账号对外展示信息。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `system.setModelShow`。

## When to use

- 用户明确要求修改“设备展示/机型文案”。
- 需要把 `model`（标识）与 `model_show`（展示文案）设置为指定值。

## When NOT to use

- 用户没有给出要设置的 `model/model_show`（不要猜）。

## Input

- Required:
  - `model` (string)
  - `model_show` (string)
- Optional:
  - `requestId` (string)

## Output

- `{ request, response }`

## Failure modes

- `INVALID`: `model` 或 `model_show` 为空。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: WS 未连接/机器人离线/权限或协议不支持。
