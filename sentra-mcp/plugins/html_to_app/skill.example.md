# html_to_app

## 功能

- 将 HTML 代码或应用需求描述转换为完整的桌面应用项目（基于 Electron）
- 支持原生 HTML、React、Vue 等框架
- 自动生成项目结构、依赖配置、打包脚本
- 可直接运行和打包为 exe/dmg/AppImage

## 实际影响

- 写本地文件：生成完整的项目目录到 `artifacts/`
- 外部网络请求：可能下载依赖包

## 使用场景

- 用户要"生成/打包/转桌面应用"
- 能拿到 description、app_name、details

## 禁止场景

- 缺少必填参数（description/app_name/details）
- 需求描述不明确

## 输入

- 必填：
  - `description`：应用描述或需求
  - `app_name`：应用名称（英文，用于生成项目文件夹）
  - `details`：细节补充要求（UI/UX、颜色、字体、动画等，越详细越好）
- 可选：
  - `html_content`：已有的 HTML 代码
  - `framework`：前端框架（vanilla/react/vue，默认 vanilla）
  - `features`：功能特性（文件读写、系统托盘、自动更新、数据库等）

## 输出

- 项目结构：`{ project_path, files: [{ path, content }] }`
- 项目目录在 `artifacts/`

## 失败模式

- `INVALID`：缺必填参数
- `TEMPLATE_FAILED`：模板生成失败
- `DEPS_FAILED`：依赖安装失败
- `TIMEOUT`：生成超时（最长 10 分钟）
