## Parent

PRD-006: 批量上传目录 (`docs/PRD-006-batch-upload.md`)

## What to build

在现有上传模态框中新增「批量上传目录」区块。包含：
- 「📁 选择目录」按钮 → 隐藏的 `<input webkitdirectory multiple>`
- 选中后显示目录名和文件数
- 「开始上传」按钮逐文件调用 `POST /api/upload`（FormData），实时显示进度 `上传中 3/15: xxx.docx`
- 完成后显示成功/失败统计，列出每个文件的上传结果
- 完成后自动刷新文件列表

垂直切片：从用户点击选择目录 → 后端上传 → 前端进度展示 → 文件列表刷新。

## Acceptance criteria

- [ ] 上传模态框有「批量上传目录」区块（与单文件上传用分隔线隔开）
- [ ] 「📁 选择目录」按钮触发目录选择器
- [ ] 选中目录后显示目录名和文件数量
- [ ] 「开始上传」按钮在未选目录时禁用
- [ ] 上传过程中实时显示 `第 N / 总文件数: 文件名`
- [ ] 上传完成后显示 `完成！成功 X，失败 Y`
- [ ] 每个文件的上传结果（✓ 成功 / ✗ 失败原因）列表展示
- [ ] 完成后自动刷新文件列表
- [ ] 「选择目录」和「开始上传」与单文件上传互不影响
- [ ] `.btn-outline` CSS 样式正常（边框按钮用于选择目录按钮）

## Blocked by

ISSUE-6.1-batch-api — 依赖后端 API 设计，但前端可先用现有 `/api/upload` 端点实现（逐文件上传）

Blocked by none for the actual UI — can start in parallel since the UI calls the existing `/api/upload` single-file endpoint in a loop. For the full batch endpoint (`/api/upload-batch`), the UI can be upgraded later.
