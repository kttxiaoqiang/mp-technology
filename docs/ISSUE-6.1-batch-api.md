## Parent

PRD-006: 批量上传目录 (`docs/PRD-006-batch-upload.md`)

## What to build

后端 `POST /api/upload-batch` 端点。

接收 `{ "dirPath": "string" }`，递归扫描目录下所有文件，对每个文件：自动分类 → 复制到目标子目录（遇重名自动加 `_1`/`_2` 序号）→ MarkItDown 转换 → 返回完整结果。目录不存在/不是目录/缺参数时返回 400。

垂直切片：这个 API 端点从请求输入到响应输出走完全程。前端的目录选择器和上传 UI 不在此 issue 中。

## Acceptance criteria

- [ ] `POST /api/upload-batch` 接受 `{ dirPath }`，递归目录下所有文件
- [ ] 文件根据 `detectCategory` 自动放入对应子目录（方案/报告/其他 等）
- [ ] 同名文件自动加 `_1`/`_2` 序号不覆盖
- [ ] 每个文件执行 MarkItDown 转换（失败不阻断）
- [ ] 响应包含 `files: [{ name, size, category, downloadPath, converted }]`、`count`、`successCount`、`failCount`
- [ ] 目录不存在时返回 400 + 错误信息
- [ ] 路径是文件而非目录时返回 400
- [ ] 缺 `dirPath` 参数时返回 400
- [ ] 空目录返回 `count: 0, successCount: 0`
- [ ] 操作日志记录 type=batch 的上传事件

## Blocked by

None — can start immediately
