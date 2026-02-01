# weather

## Capability

- 天气查询：按城市名获取天气信息（当前/24小时/7天/预警/全部）。
- 支持单城市或多城市批量查询，并对城市 ID 与天气结果做缓存。

## Real-world impact

- 外部网络请求：调用和风天气（QWeather）接口（默认 host: `devapi.qweather.com`）。
- 写本地缓存：
  - `cache/weather/city_cache.txt`（城市名 → 城市ID）
  - `cache/weather/weather_data_cache.json`（城市+queryType → 已格式化文本，TTL≈30分钟）

## When to use

- 用户问“某城市现在/未来天气如何、是否有预警”。
- 需要批量对比多个城市天气。

## When NOT to use

- 未配置天气 API Key 时（此时应提示需要配置或改为常识性建议）。

## Input

- Provide one of:
  - `city` (string)
  - `cities` (string[])
- Optional:
  - `queryType` (enum): `current` | `hourly` | `forecast` | `warning` | `all`（默认 `all`）
  - `lang` / `unit`：schema 提供但当前实现未使用（不会改变回包语言/单位）

运行环境/配置（从插件 env 或进程 env 读取）：
- `WEATHER_API_KEY`（或 `WEATHER_KEY`）：必需
- `WEATHER_API_HOST`（或 `WEATHER_HOST`）：默认 `devapi.qweather.com`

## Output

- 成功：
  - 单城市：`{ queryType, results }`
  - 多城市：`{ mode: 'batch', queryType, results }`
- `results[]` 每项：
  - `city`, `queryType`
  - `formatted`：已格式化的可读文本
  - `fromCache`：是否命中本地缓存
  - `timestamp`
  - `success`
- 失败项会包含：`error`, `code`, `advice`

## Failure modes

- `INVALID`: 缺 `city/cities` 或 `queryType` 非法。
- `NO_API_KEY`: 未配置 `WEATHER_API_KEY`。
- `WEATHER_API_FAILED`: 所有城市都失败（顶层失败，但会返回 detail.results）。
