# write_file

## Capability

- Advanced file writing plugin supporting multiple formats: text, JSON, Excel (xlsx), Word (docx), PDF, CSV, ZIP and more. Auto-creates parent directories and supports overwrite control.

## Real-world impact

- Writes local files (ensure returned paths are absolute).

## Typical scenarios

- Use when the user explicitly requests this capability and the required inputs can be extracted from context or asked via a follow-up question.

## Non-goals

- Do not use when inputs are missing and cannot be reliably inferred. Ask a follow-up question instead.
- Do not fabricate IDs, paths, URLs, tokens, or example values.

## Input

- Required fields:
  - `path`
  - `content`

- Conditional required (anyOf/oneOf): satisfy at least one group:
  - [path, content]

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
