# image_search

## Capability

- 从多个来源搜索图片并下载到本地（默认保存到 `artifacts/`）。
- 支持 Bing / 壁纸 API / Unsplash（实际启用的 provider 受环境变量与 key 影响）。
- 当下载数量超过阈值时会自动打包为 zip。

## Real-world impact

- 外部网络请求：会访问搜索源与图片直链。
- 写本地文件：会把图片下载到 `artifacts/`，必要时还会生成 zip。

## When to use

- 用户要“找 N 张某主题的高清图/壁纸/透明背景图”，并希望拿到本地文件路径用于后续处理。
- 需要一定随机性：工具内部会对结果做洗牌/混合。

## When NOT to use

- 用户不需要落地文件，只要你口头建议关键词（那就直接建议关键词即可）。
- 用户没给关键词（`query/queries`）。

## Input

- Required:
  - `query` (single) or `queries` (batch)
  - `count`
- Optional (Bing filters):
  - `bingImageType`, `bingSize`, `bingColor`, `bingLayout`, `bingFreshness`, `bingLicense`

- 批量优先用 `queries`。

## Output

- Success `data` (核心字段):
  - `status`: `OK_DIRECT` 或 `OK_ZIPPED`
  - `summary`: 简短摘要
  - `files` (direct 模式): 每张图的 `path_markdown`/`filename`/`size_mb`/`contentType`/`source`/`width`/`height` 等
  - `zip_path_markdown` + `file_list` (zipped 模式)
- Batch mode: `{ mode: 'batch', results: [{ query, success, data|error }] }`

## Failure modes

- `INVALID_PARAM`: 缺 `query/queries` 或 `count`。
- `NO_RESULT`: 搜不到结果（换关键词/放宽筛选）。
- `DOWNLOAD_FAILED`: 有结果但下载失败（换 provider/降低并发/稍后重试）。
- `INTERNAL_ERROR`: 其他异常。
