# system_info

## Capability

- 获取本机系统信息（跨平台 Windows/Linux/macOS）。
- 支持按类别查询或一次查询多个类别：OS/CPU/GPU/内存/磁盘/网络/进程/电池/USB/音频/显示/BIOS/环境变量/用户/服务/软件/温度/蓝牙/打印机等。

## Real-world impact

- 本地读取：会调用系统 API 与部分命令（如 Windows `wmic`、Linux `lscpu/df` 等，best-effort）。
- 可能包含敏感信息：
  - `environment` 类别会暴露 PATH、用户名、HOME 等环境信息
  - `users/services/software` 等可能包含本机账户/软件清单
- 可写本地缓存（可关闭）：会在 `cache/system_info/` 下写入 JSON 缓存文件。

## When to use

- 排障：需要查看 CPU/内存/磁盘/网络等信息。
- 运行环境自检：确认 OS/架构/Node 版本/进程内存。

## When NOT to use

- 用户未授权时，不要查询 `environment/users/software` 等可能涉及隐私的类别。

## Input

- 推荐使用：
  - `categories` (string[])：一次拿多个类别（会覆盖 `category`）
- 兼容字段：
  - `category` (string)：单类别（schema 标注 deprecated，但仍可用）
- Optional:
  - `detailed` (boolean; default true)
  - `useCache` (boolean; default true)
  - `cacheScope` (enum `memory`|`file`|`both`; default `both`)
  - `cacheTTL` (int seconds; default 604800=7天)

## Output

- `data`：一个对象，key 为类别名（如 `cpu/gpu/memory/...`），value 为该类别的结构化信息。
- `meta`：
  - 缓存命中：`{ cached: true, source: 'memory'|'file' }`
  - 非缓存：`{ cached: false }`

## Failure modes

- `ERR`: 获取失败（可能是权限不足、系统命令不可用、超时等）。
