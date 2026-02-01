# send_group_message

## Capability

- 校验群聊目标与消息意图（routing helper）。
- 注意：本工具**不负责真正发送消息**，只返回 `target` 与路由规则提示；最终消息需要你在 `<sentra-response>` 里输出。

## Real-world impact

- 不调用 WS/QQ，不写文件：仅做参数校验与路由提示。

## When to use

- 你需要在群里发一条消息，但想先明确“发到哪个群 + 要表达什么”。
- 需要把“内容目标”与“最终发送文本”分开（避免把占位模板当作实际发送内容）。

## When NOT to use

- 用户就是在当前群聊里对话且 `<sentra-user-question>` 已给出 `<group_id>`（直接用即可，不必额外调用）。

## Input

- Required:
  - `group_id` (string; digits only)
  - `content` (string; 意图/摘要，不是要原样复制的模板)
- Optional:
  - `media_hints` (array)

## Output

- `data.action`: `send_group_message`
- `data.target`: `{ type: 'group', id: group_id }`
- `data.note`: 路由规则（最终 `<sentra-response>` 必须包含且仅包含一个 `<group_id>`）

## Failure modes

- `INVALID`: `group_id` 为空/非纯数字字符串，或 `content` 为空。
