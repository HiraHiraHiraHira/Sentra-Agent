# qq_group_wholeBan

## Capability

- 开启/关闭指定群的全员禁言。

## Real-world impact

- 高风险群管理操作：会影响整个群的发言权限。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `group.wholeBan`。

## When to use

- 用户明确要求“开启全员禁言/解除全员禁言”，且你能拿到真实群号。

## When NOT to use

- 用户意图不明确，或群号不明确。
- 需要只禁言某个人（用 `qq_group_ban`）。

## Input

- Required:
  - `group_id` (number)
  - `on` (boolean) or `enable` (boolean)
- Optional:
  - `requestId` (string)

## Output

- 返回 `{ request, response }`：request 会包含调用的 path 与 args；response 为 WS 侧回包。

## Failure modes

- `INVALID`: `group_id` 非数字，或 `on/enable` 不是布尔值。
- `TIMEOUT`: WS/QQ 侧超时。
- `ERR`: 常见为权限不足（机器人非管理员/群主）或 WS 未连接。
