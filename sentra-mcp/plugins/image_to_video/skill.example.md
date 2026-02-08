# image_to_video

## 功能

- 根据图片+文字提示生成视频
- 使用提供的 prompt 与参考图生成视频
- 返回可下载的视频文件链接

## 实际影响

- 外部网络请求：调用视频生成 API（会产生费用）
- 返回视频链接供下载

## 使用场景

- 用户要"用图生成视频"
- 能拿到 prompt（视频需求描述）和 images（参考图）

## 禁止场景

- 缺少必填参数（prompt/images）
- 没有有效的图片路径（本地绝对路径或 URL）

## 输入

- 必填：
  - `prompt`：视频需求描述（主体、动作、风格、镜头感、时长等）
  - `images`：参考图片列表（至少 1 张，支持本地绝对路径或 URL）

## 输出

- `{ video_url, video_path, duration, format }`
- 视频链接可下载

## 失败模式

- `INVALID`：缺 prompt 或 images
- `INVALID_PATH`：图片路径无效
- `API_ERROR`：视频生成 API 报错
- `TIMEOUT`：生成超时（最长 10 分钟）
