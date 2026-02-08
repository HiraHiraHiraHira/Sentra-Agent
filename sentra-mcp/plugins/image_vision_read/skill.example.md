# image_vision_read

## 功能

- 读取并描述一张或多张图片
- 支持图片在线链接（http/https）或本地绝对路径
- 结合文本提示进行识别并返回结果
- 支持常见图片格式：JPG、PNG、GIF、WebP 等

## 实际影响

- 外部网络请求：调用视觉模型 API（读取在线图片）
- 读取本地文件：读取本地图片并 base64 编码

## 使用场景

- 用户要"识别/描述/分析"图片
- 能拿到 image/images（路径或 URL）和 prompt（识别要求）

## 禁止场景

- 缺少 prompt 或 image/images
- 图片路径无效

## 输入

- 必填：
  - `prompt`：识别要求或问题
- 必填其一：
  - `image`（单张图片）
  - `images`（批量数组）
- 图片路径：本地绝对路径或 http/https URL

## 输出

- `{ descriptions: [{ image, description }], total_images }`
- 描述为自然语言文本

## 失败模式

- `INVALID`：缺 prompt 或 image/images
- `INVALID_PATH`：路径不是绝对路径
- `IMAGE_TOO_LARGE`：图片超出大小限制
- `API_ERROR`：视觉模型 API 报错
- `TIMEOUT`：识别超时（最长 2 分钟）
