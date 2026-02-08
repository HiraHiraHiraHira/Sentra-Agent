# qq_system_getModelShow

## Capability

- 查看当前 QQ 账号的设备/模型展示信息。

## Real-world impact

- 只读查询：不修改任何状态。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `system.getModelShow`。

## When to use

- 用户要查看当前账号“对外展示的设备/机型文案”。
- 在设置展示信息（`qq_system_setModelShow`）前先确认当前值。

## When NOT to use

- WS 服务未连接/机器人不在线时不要硬试。

## Input

- Optional:
  - `requestId` (string)

## Output

- `{ request, response }`：request 为 `system.getModelShow` 调用信息；response 为 WS 侧回包。

## Failure modes

- `ERR`: WS 未连接/QQ 侧异常。
