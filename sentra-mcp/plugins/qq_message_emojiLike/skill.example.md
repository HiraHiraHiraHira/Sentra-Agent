# qq_message_emojiLike

## Capability

- 给指定消息贴表情（reaction）。
- 支持 1~3 个表情（会去重），仅支持“添加”，不支持取消。

## Real-world impact

- 消息操作：会对真实消息产生互动效果。
- 依赖 WS SDK：通过 `ws://localhost:6702` 调用 `message.emojiLike`。

## When to use

- 用户明确要给“某条具体消息”贴表情，并且你能拿到真实 `message_id`。

## When NOT to use

- 拿不到真实 `message_id`（不要用占位符）。
- 用户想取消表情（本工具不支持）。

## Input

- Required:
  - `message_id` (string; 纯数字；必须来自上下文/引用)
  - `emoji_ids` (number or number[]; max 3)
- Notes:
  - 允许传 `emoji_id`（单数）作为兼容输入，会被当作 `emoji_ids`。
  - 表情 ID 必须是 face-map 内的有效值。

## Output

- Success `data` 常见字段：
  - `summary`, `message_id`, `success_count`, `failed_count`(可选)
  - `emojis` / `emojis_success` / `emojis_failed`
  - `sdk_calls`: 每个表情一次调用的 request/response 记录

## Failure modes

- `INVALID_MESSAGE_ID`: message_id 不是纯数字字符串。
- `INVALID_EMOJI_ID` / `INVALID`: emoji_id 不合法。
- `TIMEOUT`: WS/QQ 侧超时。
- `ALL_FAILED`: 全部贴加失败（权限/协议/WS 状态）。
