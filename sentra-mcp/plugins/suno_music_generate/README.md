# Suno 音乐生成插件 (suno_music_generate)

## 功能说明

使用 AI 生成音乐，支持自定义标题、风格标签和歌词，流式生成并自动发送音乐卡片到QQ。

## 核心特性

- ✅ **流式生成**：实时流式输出生成过程
- ✅ **自动发送**：生成完成后自动发送音乐卡片
- ✅ **必需参数**：标题（title）+ 风格标签（tags）+ 歌词（lyrics）
- ✅ **灵活配置**：支持自定义 API、模型、封面等
- ✅ **双模式发送**：支持私聊和群聊

## 快速开始

### 1. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
# API 配置
SUNO_API_BASE_URL=https://api.openai.com/v1
SUNO_API_KEY=your-api-key-here
SUNO_MODEL=suno-v3.5

# 超时配置（生成音乐耗时较长）
SUNO_TIMEOUT_MS=300000

# 默认封面
SUNO_DEFAULT_COVER_URL=https://filesystem.site/cdn/20251003/lSl1Vi7WNkZzBm6lNJ3LxvxkaHJ77M.png

# WebSocket 配置
WS_SDK_URL=ws://127.0.0.1:6702
```

### 2. 基础调用

```json
{
  "title": "さびしい",
  "tags": "二次元风格，日式歌曲，女音，流行音乐，爱情，日流音乐，压抑，日语，悲怆",
  "lyrics": "静かな部屋にひとりきり、時計の音が響いてる。\n窓の外は雨、誰もいない夜、\n君の声さえ、今は遠く感じる。\n思い出だけがやさしく包むけど、\n心の隙間は埋まらないまま。\n[Chorus]\nさびしい夜をいくつ越えても、\n君のぬくもりには届かない。\n涙の理由も言えないまま、\nこの胸の奥で君を探してる。\nさびしい、ただそれだけ。",
  "group_id": "1047175021"
}
```

## 参数说明

### 必需参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `title` | string | 音乐标题 |
| `tags` | string | 风格标签，用逗号分隔 |
| `lyrics` | string | 歌词内容，支持多行和标记 |
| `user_id` | string | 私聊用户QQ号（与group_id二选一） |
| `group_id` | string | 群聊群号（与user_id二选一） |

## 使用示例

### 示例1：日系悲伤风格

```json
{
  "title": "さびしい",
  "tags": "二次元风格，日式歌曲，女音，流行音乐，爱情，日流音乐，压抑，日语，悲怆",
  "lyrics": "静かな部屋にひとりきり、時計の音が響いてる。\n窓の外は雨、誰もいない夜、\n君の声さえ、今は遠く感じる。\n[Chorus]\nさびしい夜をいくつ越えても、\n君のぬくもりには届かない。",
  "user_id": "2166683295"
}
```

### 示例2：中文流行

```json
{
  "title": "晴天",
  "tags": "流行音乐，中文，男声，轻快，青春，治愈",
  "lyrics": "[Verse]\n故事的小黄花\n从出生那年就飘着\n童年的荡秋千\n随记忆一直晃到现在\n[Chorus]\n刮风这天\n我试过握着你手\n但偏偏雨渐渐\n大到我看你不见",
  "group_id": "1047175021"
}
```

### 示例3：英文摇滚

```json
{
  "title": "Freedom",
  "tags": "rock, english, male voice, energetic, rebellious",
  "lyrics": "[Verse]\nBreaking chains, running free\nNothing's gonna hold me down\nLiving life the way it's meant to be\n[Chorus]\nThis is my freedom song\nSing it loud, sing it strong\nWe're gonna make it all along",
  "group_id": "1047175021"
}
```

## 歌词格式

支持标准音乐结构标记：

```
[Verse]    - 主歌
[Chorus]   - 副歌
[Bridge]   - 桥段
[Intro]    - 前奏
[Outro]    - 尾奏
[Pre-Chorus] - 预副歌
```

示例：
```
[Verse]
这是第一段主歌
描述故事背景

[Chorus]
这是副歌部分
最容易记住的旋律

[Bridge]
这是桥段
情绪转折
```

## 返回格式

### 成功

```json
{
  "success": true,
  "data": {
    "action": "suno_music_generate",
    "发送对象": "群聊",
    "目标": "1047175021",
    "音乐标题": "さびしい",
    "风格标签": "二次元风格，日式歌曲，女音...",
    "音频链接": "https://example.com/generated_music.mp3",
    "封面链接": "https://filesystem.site/cdn/.../cover.png",
    "生成响应": "完整的AI响应文本...",
    "timestamp": "2025-11-02T13:27:00.000Z"
  }
}
```

### 失败

```json
{
  "success": false,
  "code": "NO_AUDIO_LINK",
  "error": "生成的响应中未找到音频链接",
  "details": {
    "response": "AI的完整响应...",
    "title": "さびしい",
    "tags": "..."
  }
}
```

## 错误代码

| 错误码 | 说明 |
|--------|------|
| `INVALID_TITLE` | 缺少 title 参数 |
| `INVALID_TAGS` | 缺少 tags 参数 |
| `INVALID_LYRICS` | 缺少 lyrics 参数 |
| `TARGET_REQUIRED` | 未提供 user_id 或 group_id |
| `TARGET_EXCLUSIVE` | 同时提供了两个目标 |
| `MISSING_API_KEY` | 未配置 API 密钥 |
| `NO_AUDIO_LINK` | 响应中未找到音频链接 |
| `SEND_FAILED` | 音乐卡片发送失败 |

## 流式输出

插件使用流式输出，生成过程可实时查看：

```
[stream] 正在生成音乐...
[stream] 分析歌词结构...
[stream] 生成旋律...
[stream] 渲染音频文件...
[stream] 音频链接：https://...
```

## 配置说明

### API 配置

```bash
# OpenAI 兼容的 API
SUNO_API_BASE_URL=https://api.openai.com/v1

# API 密钥
SUNO_API_KEY=sk-xxx

# 模型名称
SUNO_MODEL=suno-v3.5
```

### 超时配置

```bash
# 生成超时（5分钟）
SUNO_TIMEOUT_MS=300000
```

### 封面配置

```bash
# 默认封面图片
SUNO_DEFAULT_COVER_URL=https://your-cdn.com/cover.png
```

## 注意事项

1. **生成时间较长**：通常需要 1-3 分钟，请耐心等待
2. **API 费用**：使用第三方 API 可能产生费用
3. **歌词质量**：歌词质量直接影响生成效果
4. **风格标签**：标签越具体，生成的音乐越符合预期
5. **流式输出**：支持实时查看生成进度

## 常见问题

### Q: 为什么生成失败？
A: 检查 API 配置、网络连接、歌词格式是否正确。

### Q: 如何提高生成质量？
A: 提供详细的风格标签和结构化的歌词。

### Q: 支持哪些语言？
A: 支持中文、日文、英文等多种语言。

### Q: 生成时间太长怎么办？
A: 可以调整 `SUNO_TIMEOUT_MS` 参数，但建议不要低于 180000（3分钟）。

### Q: 音频链接失效怎么办？
A: 音频链接的有效期取决于 API 提供商，建议及时下载保存。

## 许可

本插件遵循项目整体许可协议。
