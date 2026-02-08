# music_card

## 功能

- 根据关键词搜索网易云音乐
- 通过 WebSocket SDK 发送音乐卡片到 QQ 私聊或群聊

## 实际影响

- 外部网络请求：调用网易云音乐搜索接口
- 发送消息：音乐卡片发送到指定群/私聊

## 使用场景

- 用户要"搜歌/发音乐卡片"
- 能拿到 keyword/keywords（歌曲名或歌曲名+歌手名）

## 禁止场景

- 缺少 keyword/keywords
- 搜索不到结果

## 输入

- 必填其一：
  - `keyword`（单个关键词）
  - `keywords`（批量数组，如 ["稻香 周杰伦", "夜曲 周杰伦"]）
- 可选：
  - `provider`：音乐提供方（默认 163 网易云）
  - `limit`：搜索结果数量上限（1-10，默认 6）
  - `random`：是否随机选一首（默认 true）
  - `pick`：选择索引（random=false 时有效）
  - `user_id` / `group_id`：发送目标
  - `fallback_to_record`：卡片失败时发送音频直链

## 输出

- 搜索结果：`{ results: [{ title, artist, id, url }] }`
- 发送结果：音乐卡片发送到目标

## 失败模式

- `INVALID`：keyword/keywords 格式无效
- `NO_RESULT`：搜索无结果
- `SEND_FAILED`：卡片发送失败
- `TIMEOUT`：搜索或发送超时
