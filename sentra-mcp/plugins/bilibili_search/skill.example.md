# bilibili_search

## 功能

- 搜索 B 站视频并下载到本地，或以自定义音乐卡片形式发送到 QQ 群聊/私聊

## 实际影响

- 写本地文件：视频下载到 `artifacts/`，音乐卡片发送到 QQ
- 外部网络请求：调用 B 站搜索接口

## 使用场景

- 用户要"搜某视频/下某视频/发音乐卡片"
- 能拿到关键词（keyword/keywords）

## 禁止场景

- 拿不到关键词（不要猜）
- 缺少发送目标（user_id/group_id）且 send_as_music_card=true

## 输入

- 必填其一：
  - `keyword`（单个关键词）
  - `keywords`（批量数组）
- 可选：
  - `pick`：选择 first 或 random（默认 first）
  - `user_id` / `group_id`：发送目标
  - `send_as_music_card`：是否发送音乐卡片

## 输出

- 下载模式：`{ files: [{ path_markdown, filename }] }`
- 音乐卡片：发送到指定群/私聊

## 失败模式

- `INVALID`：缺 keyword/keywords
- `NO_RESULT`：搜不到结果
- `DOWNLOAD_FAILED`：有结果但下载失败
- `ERR`：其他异常
