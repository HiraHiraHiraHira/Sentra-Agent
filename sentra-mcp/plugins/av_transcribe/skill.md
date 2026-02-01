# av_transcribe

## Capability

- 将音频/视频转成文本（逐段 + 合并文本），并返回语言信息。
- 支持本地绝对路径或 http/https URL。

## Real-world impact

- 外部网络请求：会调用语音转写服务（OpenAI Whisper 兼容接口 / Gemini 模式）。
- 可能执行本地程序：某些格式（常见 amr）可能需要本机 `ffmpeg` 转码后再转写。

## When to use

- 用户给了语音/视频文件，让你“转文字/整理逐字稿/提取要点”。
- 下游需要文本（摘要、翻译、时间轴、检索）。

## When NOT to use

- 用户没有提供可访问的文件路径/链接。
- 用户只是闲聊，不需要从音视频提取信息。

## Input

- Provide one of:
  - `file`: 单个音视频路径（本地必须绝对路径）或 URL
  - `files`: 多个音视频路径/URL（批量）
- Optional:
  - `language`: 语言提示（未提供则自动/由服务决定）
  - `prompt`: 转写提示/上下文（用于专有名词、口癖纠正等）

- 批量优先用 `files`。
- 不要伪造路径/URL；拿不到就追问。

## Output

- Success `data` (核心字段):
  - `text`: 合并后的全文
  - `segments`: 分段数组（至少含 `index`、`text`，部分模式可能含时间戳）
  - `language`: `{ raw, code, name, hint }`
  - `meta`: `{ model, file, chunks, source, rawType, raw }`

## Failure modes

- `NO_API_KEY`: 未配置 `WHISPER_API_KEY`。
- `INVALID`: 缺少 `file/files`。
- `FILE_NOT_FOUND`/`INVALID_AUDIO`: 本地文件不存在/为空/格式异常。
- `UNSUPPORTED_FORMAT`/`FFMPEG`: 常见于 amr/qq 语音，需转码或检查 `FFMPEG_PATH`。
- `TIMEOUT`: 文件太大/网络不稳定，建议截短、分段、或先下载成本地再试。
