# image_draw

## 功能

- 根据文本提示生成或绘制图片
- 返回包含图片链接的 Markdown 内容

## 实际影响

- 外部网络请求：调用绘图 API（会产生费用）
- 返回图片链接供后续使用

## 使用场景

- 用户要"生成/画一张图"
- 能拿到 prompt（绘图指令）

## 禁止场景

- prompt 不明确或为空
- prompt 不是英文（必须为英文）

## 输入

- 必填：
  - `prompt`：绘图指令/主题描述（**必须为英文**）
- 可选：
  - `model`：绘图模型名称（不传则回退 `DRAW_MODEL`）
- 重要规则：
  - 如果包含男性角色，必须在开头添加 `1boy`（一个男性）或 `xboy`（x个男性）
  - 如果包含女性角色，必须添加 `1girl` 或 `xgirl`
  - 例如：`1boy, a handsome man` 或 `1girl, beautiful woman` 或 `2boy 1girl, group photo`

## 模型选择建议

- 若用户没有指定模型或者画风等等：不要强行补 `model` 参数，直接让插件回退到环境变量 `DRAW_MODEL`
- 若用户明确要求“速度/质量/特定风格/特定模型名”：再传 `model`
- 注意：模型名称如果你要传递了，需要和下面的例子名称完全相同
- 重点参考：
  - `novelai-shadowforge-v1`：高质量动漫绘图，novelai绘图风格
  - `anishadow-v10-forge`：更快出图，动漫风格，便宜
  - `newbie-image`：高质量动漫绘图，适合特定场景，人物肖像等等
  - `gemini-3-pro-image-preview`：Google的全能绘图模型，适用于绝大多数场景

## 输出

- `{ markdown: "![描述](图片链接)" }`
- Markdown 格式，可直接插入到回复中

## 失败模式

- `INVALID`：缺 prompt
- `API_ERROR`：绘图 API 报错
- `TIMEOUT`：生成超时