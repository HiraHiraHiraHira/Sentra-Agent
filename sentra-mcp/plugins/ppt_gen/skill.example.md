# ppt_gen

## 功能

- 根据 Markdown/HTML 或主题+提纲生成可编辑的 PPTX 幻灯片
- 输出 .pptx 文件到 `artifacts/`

## 实际影响

- 写本地文件：PPT 文件保存到 `artifacts/`
- 外部网络请求：AI 生成内容时可能调用

## 使用场景

- 用户要"生成/制作 PPT"
- 能拿到 subject+outline 或 slides

## 禁止场景

- 缺少必填参数（subject+outline 或 slides）
- 需求描述不明确

## 输入

- 必填其一：
  - `subject` + `outline`：主题和提纲（AI 生成每页内容）
  - `slides`：每页内容数组（直接渲染）
- 可选：
  - `page_count`：总页数（1-50，默认 10）
  - `mode`：`ai_generate` 或 `direct_render`
  - `auto_split`：是否自动拆分长文本为多页
  - `theme`：主题风格（default/dark/business/simple）
  - `filename`：输出文件名

## 输出

- `{ pptx_path, page_count, filename }`
- PPTX 文件路径为绝对路径

## 失败模式

- `INVALID`：缺必填参数
- `CONTENT_FAILED`：AI 生成内容失败
- `RENDER_FAILED`：PPT 渲染失败
- `TIMEOUT`：生成超时（最长 2 分钟）
