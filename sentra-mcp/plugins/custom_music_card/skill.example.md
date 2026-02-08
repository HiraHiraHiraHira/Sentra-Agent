# custom_music_card

## 功能

- 发送自定义伪装音乐卡片到 QQ 群聊或私聊
- 支持 MP3/MP4 等在线链接

## 实际影响

- 发送消息：音乐卡片发送到指定群/私聊
- 不写本地文件

## 使用场景

- 用户要"发音乐卡片/伪装分享"
- 能拿到 media_url（在线链接）和 title

## 禁止场景

- 缺少必填参数（media_url/title）
- 链接无法访问

## 输入

- 必填：
  - `media_url`：音频或视频的在线链接
  - `title`：卡片标题
- 可选：
  - `jump_url`：点击卡片跳转的链接（默认 media_url）
  - `cover_url`：封面图片链接
  - `user_id` / `group_id`：发送目标

## 输出

- 发送结果：`{ success, card_type, message }`

## 失败模式

- `INVALID`：缺必填参数
- `INVALID_URL`：链接格式无效
- `FETCH_FAILED`：链接无法访问
- `SEND_FAILED`：卡片发送失败
