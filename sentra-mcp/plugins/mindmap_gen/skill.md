# mindmap_gen

## Capability

- Generate a detailed mind map from structured prompt data. Accepts comprehensive information including central topic, main branches, sub-branches, relationships, and styling preferences. Returns both markdown representation and optionally renders a high-quality PNG image via Puppeteer

## Real-world impact

- Writes local files (ensure returned paths are absolute).

## Typical scenarios

- Use when the user explicitly requests this capability and the required inputs can be extracted from context or asked via a follow-up question.

## Non-goals

- Do not use when inputs are missing and cannot be reliably inferred. Ask a follow-up question instead.
- Do not fabricate IDs, paths, URLs, tokens, or example values.

## Input

- Required fields:
  - `prompt`
  - `filename`

- Conditional required (anyOf/oneOf): satisfy at least one group:
  - [prompt, filename]

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
