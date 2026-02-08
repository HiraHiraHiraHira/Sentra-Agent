# web_parser

## 功能

- 网页解析与视觉网页分析：渲染页面后提取标题/正文/元数据
- 全屏截图 + 视觉模型读图（LLM），补全 DOM 抽取缺失的内容
- 适用于图文混排、截图文字、canvas/图表、动态渲染页面、反爬页面

## 实际影响

- 外部网络请求：访问目标网页（会产生请求/流量）
- 写本地文件：截图保存到 `artifacts/`

## 使用场景

- 用户要"解析/读图/总结某网页"
- 能拿到 URL（url 或 urls）

## 禁止场景

- 拿不到 URL（不要猜）
- prompt 不明确

## 输入

- 必填：`prompt`（你希望从网页获取什么）
- 必填其一：
  - `url`（单个网页）
  - `urls`（批量数组）

## 输出

- 结构化数据：`{ results: [{ url, title, content, screenshot_path }] }`
- 截图路径为绝对路径

## 失败模式

- `INVALID`：缺 prompt 或 url/urls
- `FETCH_FAILED`：网页访问失败（404/超时/被墙）
- `PARSE_FAILED`：DOM 解析失败
- `TIMEOUT`：渲染/读图超时
