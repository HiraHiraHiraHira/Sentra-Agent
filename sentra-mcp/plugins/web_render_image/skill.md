# web_render_image

## Capability

- 将 `html` 字符串或本地 `file`(HTML) 渲染为 PNG 截图。
- 支持整页截图或指定 `selector` 元素截图，可注入 `css/js`。

## Real-world impact

- 写本地文件：会在 `artifacts/` 下生成截图 PNG（以及 html 输入时的临时 html 文件）。
- 依赖运行环境：需要 `puppeteer` 可用。

## When to use

- 需要把一段 HTML/CSS 变成可发送的图片（模板图、卡片图、预览图）。
- 需要截图来验证页面布局/渲染效果。

## When NOT to use

- 不支持 `url` 参数（只支持 `html` 或本地 `file`）。
- 用户只是要 HTML 源码而不是图片。

## Input

- Provide one of:
  - `html`: HTML 片段或整页
  - `file`: 本地 HTML 文件路径（建议绝对路径）
- Optional:
  - `selector`: 仅截取指定元素
  - `fullPage`: 默认 true（有 selector 时忽略）
  - `wait_for`: `auto|load|networkidle|domcontentloaded`
  - `css` / `js`: 注入内容

- 不要伪造路径；本地文件不存在会失败。

## Output

- Success `data` (核心字段):
  - `path_markdown`: `![render_xxx.png](E:/.../artifacts/render_xxx.png)`
  - `size_bytes`, `format`, `viewport`, `source`
  - `failed_resources`(可选)

## Failure modes

- `INVALID`: 缺 `html/file`。
- `UNSUPPORTED`: 传了 `url`。
- `NO_PUPPETEER`: 环境缺 puppeteer。
- `FILE_NOT_FOUND`: 本地 file 不存在。
- `SELECTOR_NOT_FOUND`: selector 未匹配。
- `TIMEOUT`: 渲染/加载超时。
