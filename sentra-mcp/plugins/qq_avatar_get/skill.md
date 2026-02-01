# qq_avatar_get

## Capability

- 下载一个或多个 QQ 号的头像，并返回本地图片路径（用于后续识图/转发/存档）。

## Real-world impact

- 外部网络请求：会访问 QQ 头像接口（常见域名 `q.qlogo.cn`）。
- 写本地文件：会把头像下载到 `artifacts/`，并可能写入缓存。

## When to use

- 用户要“看某人的头像/保存头像/拿头像做后续处理”。
- 需要批量拉取多个 QQ 号头像。

## When NOT to use

- 用户未提供 QQ 号。

## Input

- Provide one of:
  - `user_id` (string)
  - `user_ids` (string[])
- Optional:
  - `useCache` (boolean; default true)

## Output

- 单个：
  - `path_absolute`: 本地绝对路径
  - `path_markdown`: `![avatar](...)`
  - `content`: 同上（方便直接渲染）
- 批量：`{ mode: 'batch', results: [{ user_id, success, data|error }] }`

## Failure modes

- `INVALID`: 缺 `user_id/user_ids`。
- `TIMEOUT`: 下载超时。
- `ERR`: 网络不可达/接口异常/写文件失败。
