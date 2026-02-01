# image_vision_read

## Capability

- 读取并描述一张或多张图片。支持图片在线链接（http/https）或本地绝对路径；结合文本提示进行识别并返回结果。支持常见图片格式包括 JPG、PNG、GIF、WebP 等。

## Real-world impact

- Read-only: does not modify local files or external systems.

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
  - [image]
  - [images]

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
