# html_to_app

## Capability

- 将 HTML 代码或应用需求描述转换为完整的桌面应用项目（基于 Electron），支持原生 HTML、React、Vue 等框架。自动生成项目结构、依赖配置、打包脚本，可直接运行和打包为 exe/dmg/AppImage。

## Real-world impact

- Unknown/depends on implementation; be conservative and verify inputs carefully.

## Typical scenarios

- Use when the user explicitly requests this capability and the required inputs can be extracted from context or asked via a follow-up question.

## Non-goals

- Do not use when inputs are missing and cannot be reliably inferred. Ask a follow-up question instead.
- Do not fabricate IDs, paths, URLs, tokens, or example values.

## Input

- Required fields:
  - `description`
  - `app_name`
  - `details`

- Conditional required (anyOf/oneOf): satisfy at least one group:
  - [description, app_name, details]

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
