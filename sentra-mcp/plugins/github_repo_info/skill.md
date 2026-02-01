# github_repo_info

## Capability

- 查询 GitHub 仓库信息（基础信息、提交、贡献者、Issues/PR、分支等），并可按开关补充 languages/topics/releases/tags/readme/community/stats。
- 支持单仓库或多仓库批量。

## Real-world impact

- 外部网络请求：调用 GitHub REST API（默认 `https://api.github.com`）。
- 可能触发 GitHub 速率限制；配置 `GITHUB_TOKEN`/`GH_TOKEN` 可提升配额。

## When to use

- 快速了解某个仓库的基本情况与活跃度（stars、最近更新、开放 issue/pr）。
- 需要批量对比多个仓库。

## When NOT to use

- 用户没给出明确仓库地址/owner/repo（不要猜）。

## Input

- Provide one of:
  - `repoUrl` (string)：`owner/repo` 或 `https://github.com/owner/repo`
  - `repoUrls` (string[])：批量
- Optional (limits):
  - `max_commits` (1-50)
  - `max_contributors` (1-50)
  - `max_tags` (1-50)
  - `readme_preview_chars` (50-5000)
- Optional (include flags):
  - `include_languages`, `include_topics`, `include_releases`, `include_tags`, `include_readme_preview`, `include_community_profile`
  - `include_stats.commit_activity`（注意 GitHub 可能返回 202 calculating）

## Output

- 单仓库：返回一个结构化对象（中文字段为主），包括：
  - `基本信息` / `概要` / `最近提交` / `主要贡献者` / `快速链接`
  - 可选：`语言统计`/`话题`/`最新发布`/`标签`/`README预览`/`社区健康`/`统计`
  - `元数据.rate_limit`（从响应头提取）与 `元数据.partial_errors`（部分端点失败列表）
- 多仓库：`{ mode: 'batch', results: [{ input, success, code, data, error, hint, advice }] }`

## Failure modes

- `INVALID`: 缺 `repoUrl/repoUrls` 或格式无法解析。
- `NOT_FOUND`: 仓库不存在/已重命名/无权限。
- `UNAUTHORIZED`: 令牌无效或访问私有仓库需要权限。
- `FORBIDDEN`: 被拒绝访问。
- `RATE_LIMIT`: 命中速率限制（建议配置 token）。
- `BATCH_FAILED`: 批量模式全部失败。
- `ERR`: 其它网络/解析错误。
