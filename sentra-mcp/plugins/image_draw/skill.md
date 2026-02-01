# image_draw

## Capability

- 根据文本提示生成或绘制图片，返回包含图片链接的 Markdown 内容。

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

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
