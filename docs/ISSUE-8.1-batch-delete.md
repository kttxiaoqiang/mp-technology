# Issue 1.1: 后端批量删除 API

## 目标

`POST /api/files/batch-delete` — 接收文件 ID 数组，批量删除文件（含 .md + _images 目录 + DB 记录 + 日志）

## 验收标准

1. 接收 `{ ids: number[] }` 请求体
2. 校验权限（仅 admin）
3. 对每个 ID：
   - 查询 DB 获取 `storage_path`（源文件路径）和 `md_path`（Markdown 路径）
   - 删除 `knowledge_base_dir + storage_path` 文件
   - 删除 `knowledge_base_dir + md_path` 文件（如果存在）
   - 删除对应的 `_images/` 目录
4. 最后删除 DB 记录
5. 记录操作日志（单条 `batch-delete-files` 日志，含文件名列表）
6. 返回 `{ deleted: number }`
7. 错误处理：文件不存在则跳过，不中断批次

## 技术方案

- 文件：`server.cjs` 新增路由，复用 `requireAdmin` 中间件
- 路径：`knowledge_base_dir` 来自全局配置
- 日志钩子：使用现有 `addLog(req, 'batch-delete-files', username, ip, detail)`
- 删除策略：`fs.rmSync` 容错（不存在的文件直接忽略）

## 测试

- POST 批量删除 → 文件 + .md + _images 全部移除
- POST 删除部分不存在 ID → 返回正确的 `deleted` 数量
- 非管理员 401
