# video_generate

## 功能

- 根据文本提示生成或制作视频
- 返回包含视频链接的 Markdown 内容

## 实际影响

- 外部网络请求：调用视频生成 API（会产生费用）
- 返回视频链接供下载

## 使用场景

- 用户要"生成/制作视频"
- 能拿到 prompt（英文描述的提示词）

## 禁止场景

- prompt 不明确或为空
- prompt 不是英文（必须为英文）

## 输入

- 必填：
  - `prompt`：视频生成的提示词（**必须为英文**）

## 输出

- `{ video_url, video_path, duration, format }`
- Markdown 格式返回，可直接插入回复

## 失败模式

- `INVALID`：缺 prompt
- `API_ERROR`：视频生成 API 报错
- `TIMEOUT`：生成超时（最长 3 分钟）
