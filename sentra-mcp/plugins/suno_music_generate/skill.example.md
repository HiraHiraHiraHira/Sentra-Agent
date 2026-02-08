# suno_music_generate

## 功能

- 使用 AI 生成音乐，支持自定义标题、标签和歌词
- 流式生成并发送音乐卡片到 QQ 群聊/私聊

## 实际影响

- 写本地文件：音乐文件保存到 `artifacts/`
- 外部网络请求：调用 Suno API（会产生费用）
- 发送消息：音乐卡片发送到指定群/私聊

## 使用场景

- 用户要"生成/创作某首歌"
- 能拿到 title、tags、lyrics

## 禁止场景

- 缺少必填参数（title/tags/lyrics）
- 缺少发送目标（user_id/group_id）且需要发送卡片

## 输入

- 必填：
  - `title`：音乐标题
  - `tags`：风格标签（如：二次元、日式、女音、流行）
  - `lyrics`：歌词内容（支持 Verse/Chorus 标记）
- 可选：
  - `user_id` / `group_id`：发送目标
  - `schedule`：延迟发送

## 输出

- 生成结果：`{ id, title, audio_url, image_url, video_url }`
- 音乐卡片：发送到指定群/私聊

## 失败模式

- `INVALID`：缺必填参数
- `API_ERROR`：Suno API 报错
- `TIMEOUT`：生成超时（最长 5 分钟）
- `SEND_FAILED`：音乐卡片发送失败
