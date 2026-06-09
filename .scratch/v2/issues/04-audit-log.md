Status: ready
Parent: PRD.md
Blocked by: #01-database-init

## What to build

操作的审计日志记录。

日志记录点（在已有或新建 API 里触发）：
1. 用户登录成功 → action: 'login'
2. 创建用户 → action: 'add_user'（detail 包含新用户名）
3. 删除用户 → action: 'delete_user'（detail 包含被删用户名）
4. 上传文档 → action: 'upload'（detail 包含文档名和分类）
5. 删除文档 → action: 'delete'（detail 包含文档名）

日志查询 API（仅 admin）：
- `GET /api/admin/logs` — 日志列表，支持分页
- 默认返回最近 30 天，支持 `?days=xxx` 参数
- 自动清理 6 个月前的日志

前端：
- 操作日志页面（`/admin/logs`）
- 表格展示：操作时间、操作人、操作类型、详情
- 导航栏上增加"操作日志"入口（仅管理员可见）

## Acceptance criteria

- [ ] 5 种操作均被记录
- [ ] 日志 API 仅管理员可访问
- [ ] 日志页面展示列表，按时间倒序
- [ ] 超过 6 个月的日志自动清理（启动时或定期）
- [ ] 日志 UI 操作类型有易读的中文描述

## Blocked by

#01-database-init
