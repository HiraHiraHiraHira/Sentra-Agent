# mindmap_gen

## 功能

- 根据结构化提示词生成思维导图
- 返回 Markdown 表示 + 可选的高质量 PNG 图片（通过 Puppeteer 渲染）

## 实际影响

- 写本地文件：PNG 图片保存到 `artifacts/`
- 外部网络请求：可能调用 Puppeteer 渲染服务

## 使用场景

- 用户要"生成/制作/画一个思维导图"
- 能拿到 prompt（导图内容描述）和 filename

## 禁止场景

- 缺少必填参数（prompt/filename）
- prompt 不明确（无法生成有效的导图结构）

## 输入

- 必填：
  - `prompt`：思维导图的结构化描述（中心主题、分支、子分支等）
  - `filename`：输出文件名（仅文件名，不含目录）
- 可选：
  - `width` / `height`：画布尺寸（默认 2400x1600）
  - `style`：样式（默认 default）
  - `render`：是否渲染 PNG（默认 true）
  - `waitTime`：渲染等待时间（默认 8000ms）

## 输出

- Markdown：`{ mindmap: "..." }`
- PNG：`{ image_path: "/absolute/path/to/file.png" }`

## 失败模式

- `INVALID`：缺 prompt 或 filename
- `PARSE_FAILED`：prompt 解析失败
- `RENDER_FAILED`：PNG 渲染失败
- `TIMEOUT`：渲染超时
