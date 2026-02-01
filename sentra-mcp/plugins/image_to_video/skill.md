# image_to_video

## Capability

- 根据图片+文字提示生成视频：直接使用你提供的 prompt 与参考图生成视频，并返回可下载的视频文件链接。

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
  - `images`

- Conditional required (anyOf/oneOf): satisfy at least one group:
  - [prompt, images]

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
