# document_read

## 功能

- 读取并解析各种文档和代码文件
- 支持文档：DOCX、PDF、XLSX、CSV、TXT、JSON、XML、Markdown、HTML
- 支持代码：Python、JavaScript、TypeScript、Go、Java、C/C++
- 支持在线链接（http/https）或本地绝对路径
- 自动检测编码（UTF-8、GBK 等）并转换为纯文本

## 实际影响

- 读取文件：不修改本地文件
- 外部网络请求：访问在线文档链接

## 使用场景

- 用户要"读/解析/提取"某个文件
- 能拿到 file/files（本地绝对路径或 URL）

## 禁止场景

- 拿不到文件路径（不要猜）
- 不支持的文件格式

## 输入

- 必填其一：
  - `file`（单个文件）
  - `files`（批量数组）
- 可选：
  - `encoding`：文本编码（auto 检测失败时指定，如 gbk、shift_jis）

## 输出

- 结构化数据：`{ contents: [{ file, content, encoding }] }`
- 内容为纯文本格式

## 失败模式

- `INVALID`：缺 file/files
- `FILE_NOT_FOUND`：文件不存在
- `INVALID_PATH`：路径不是绝对路径
- `PARSE_FAILED`：文件解析失败（不支持的格式/损坏）
- `FETCH_FAILED`：在线链接访问失败
