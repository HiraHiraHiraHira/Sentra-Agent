# video_vision_read

## Capability

- 读取并分析一个或多个视频（URL 或本地绝对路径），根据 `prompt` 输出对视频内容的回答/描述。

## Real-world impact

- 外部网络请求：会调用视觉模型 API（OpenAI 兼容 `/chat/completions` 或 Gemini `:generateContent`）。
- 读取本地文件：当输入为本地视频路径时会直接读取并 base64 编码。
- 不写文件。

## When to use

- 用户给了视频，让你识别/描述/提取信息（人物动作、字幕内容、关键帧信息、异常行为等）。
- 用户明确给了关注点（`prompt`）。

## When NOT to use

- 没有视频输入，或没有明确问题（prompt）。
- 需要真正“下载/保存/剪辑”视频（本工具不做）。

## Input

- Required:
  - `prompt`
  - `video` (single) or `videos` (array)
- Local video paths must be absolute.
- 视频大小受 `VIDEO_VISION_MAX_SIZE_MB` 限制，超限建议截取片段或压缩。

## Output

- Success `data` (核心字段):
  - `prompt`
  - `description`: 模型输出
  - `video_count`
  - `formats`: MIME 列表
  - `total_size_mb`

## Failure modes

- `INVALID`: 缺 `prompt` 或缺 `video/videos`。
- `INVALID_PATH`: 本地路径不是绝对路径。
- `VIDEO_TOO_LARGE`: 视频超出大小限制。
- `TIMEOUT`: 网络/API 超时。
