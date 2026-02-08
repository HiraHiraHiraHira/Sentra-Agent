# write_file

## 功能

- 高级文件写入插件，支持多种格式：文本、JSON、Excel (xlsx)、Word (docx)、PDF、CSV、ZIP 等
- 自动创建父目录，支持覆盖控制

## 实际影响

- 写本地文件：文件保存到指定路径
- 自动创建目录：路径不存在时自动创建

## 使用场景

- 用户要"写/保存/导出"文件
- 能拿到 path（绝对路径）和 content

## 禁止场景

- 缺少必填参数（path/content）
- 路径不是绝对路径

## 输入

- 必填：
  - `path`：文件路径（**必须为绝对路径**，包含盘符或根目录）
  - `content`：文件内容
- 可选：
  - `baseDir`：基础输出目录（默认 artifacts）
  - `encoding`：编码格式（默认 utf-8，base64 用于二进制）
  - `overwrite`：是否覆盖（默认 true）
  - `fileType`：手动指定文件类型（通常由扩展名自动检测）

## 输出

- `{ path_absolute, path_markdown }`
- 文件路径为绝对路径

## 失败模式

- `INVALID`：缺 path 或 content
- `INVALID_PATH`：路径不是绝对路径
- `PERMISSION_DENIED`：无写入权限
- `PARSE_FAILED`：内容格式解析失败
- `TIMEOUT`：写入超时（最长 2 分钟）
