# Issue 3.1: 后端统计 API 与搜索日志记录

## Parent

PRD-003-dashboard-stats-charts.md

## What to build

后端提供数据供前台图表使用。两个独立但关联的能力：

**1. 搜索日志记录**：在 `GET /api/search` 端点中，当收到非空搜索词时，将关键词（小写、截断 50 字符）和时间戳追加写入 `/tmp/search-log.jsonl`，每行一个 JSON 对象。写入失败保持静默，不影响搜索响应。

**2. `/api/stats` 端点**：返回聚合统计数据，包括：
- `categories` — 按 category 字段分组的文件计数
- `extensions` — 按文件后缀分组计数（从 original_ext 或文件名推断）
- `monthlyTrend` — 按 mtime 月份分组的文件计数，按时间排序
- `popularSearches` — 从 `/tmp/search-log.jsonl` 读取最近 500 条记录，按关键词频率排序取前 10

所有数据来源于 `scanFiles()` 一次扫描和日志文件读取，无数据库依赖。

## Acceptance criteria

- [ ] `/api/search` 收到非空查询时，将 `{keyword, ts}` JSON 追加到 `/tmp/search-log.jsonl`
- [ ] 空查询不写日志
- [ ] 日志写入失败（文件不可写等）不抛出错误，不阻塞正常搜索流程
- [ ] `GET /api/stats` 返回 200，响应包含 `categories`、`extensions`、`monthlyTrend`、`popularSearches`
- [ ] `categories` 对象包含所有分类及其计数
- [ ] `monthlyTrend` 按月份排序
- [ ] `popularSearches` 在无搜索记录时返回空数组
- [ ] 服务端 `node -c server.cjs` 语法检查通过
- [ ] 函数签名和 try/catch 边界经过重复测试验证

## Blocked by

None - can start immediately
