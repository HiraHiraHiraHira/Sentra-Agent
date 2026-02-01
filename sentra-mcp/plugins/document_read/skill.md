# document_read

## Capability

- 读取并解析各种文档和代码文件，包括 DOCX、PDF、XLSX、CSV、TXT、JSON、XML、Markdown、HTML、Python、JavaScript、TypeScript、Go、Java、C/C++ 等。支持在线链接（http/https）或本地绝对路径。自动检测编码（UTF-8、GBK 等）并转换为纯文本。

## Real-world impact

- Writes local files (ensure returned paths are absolute).

## Typical scenarios

- Use when the user explicitly requests this capability and the required inputs can be extracted from context or asked via a follow-up question.

## Non-goals

- Do not use when inputs are missing and cannot be reliably inferred. Ask a follow-up question instead.
- Do not fabricate IDs, paths, URLs, tokens, or example values.

## Input

- Conditional required (anyOf/oneOf): satisfy at least one group:
  - [file]
  - [files]

- Prefer batch/array fields when the schema provides both singular and plural versions (e.g., query/queries, file/files, keyword/keywords).
- Prefer real values extracted from conversation history or prior tool results; do not use placeholders.

## Output

- The tool returns structured data. If it produces local files, paths must be absolute paths.

## Failure modes

- If execution fails, explain the reason and provide actionable next steps (e.g., correct inputs, retry later, narrow scope).
