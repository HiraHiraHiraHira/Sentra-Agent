# web_parser

## Capability

- 网页解析与视觉网页分析：渲染页面后提取标题/正文/元数据，并可对页面进行全屏截图 + 视觉模型读图（LLM）以补全 DOM 抽取缺失的内容（例如图文混排、截图文字、canvas/图表、被脚本渲染的片段、反爬导致的空 DOM 等）。

## Real-world impact

- Unknown/depends on implementation; be conservative and verify inputs carefully.

## Typical scenarios

- Use when the user explicitly requests this capability and the required inputs can be extracted from context or asked via a follow-up question.

## Non-goals

- Do not use when inputs are missing and cannot be reliably inferred. Ask a follow-up question instead.
- Do not fabricate IDs, paths, URLs, tokens, or example values.

## Input

- Required fields:
  - `prompt`

- Conditional required (anyOf/oneOf): satisfy at least one group:
  - [prompt]
  - [url]
  - [urls]

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
