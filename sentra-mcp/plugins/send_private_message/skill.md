# send_private_message

## Capability

- 校验私聊目标与消息意图（routing helper）。
- 注意：本工具**不负责真正发送消息**，只返回 `target` 与路由规则提示；最终消息需要你在 `<sentra-response>` 里输出。

## Real-world impact

- 不调用 WS/QQ，不写文件：仅做参数校验与路由提示。

## When to use

- 需要给某个 QQ 用户发私聊，但想先明确“发给谁 + 要表达什么”。

## When NOT to use

- 在当前私聊对话里直接回复且 `<sentra-user-question>` 已给出 `<sender_id>`（直接用即可）。

## Input

- Required:
  - `user_id` (string; digits only)
  - `content` (string; 意图/摘要)
- Optional:
  - `media_hints` (array)

## Output

- `data.action`: `send_private_message`
- `data.target`: `{ type: 'private', id: user_id }`
- `data.note`: 路由规则（最终 `<sentra-response>` 必须包含且仅包含一个 `<user_id>`）

## Failure modes

- `INVALID`: `user_id` 为空/非纯数字字符串，或 `content` 为空。
