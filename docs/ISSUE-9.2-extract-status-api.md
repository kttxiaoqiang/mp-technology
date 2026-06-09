# ISSUE-9.2: FAQ 抽取状态查询 API + 抽取日志

## 关联 PRD
PRD-009 — 上传自动抽取 FAQ

## 目标
提供两个新端点，让前端可以查看自动抽取的状态和历史日志。

## API 设计

### `GET /api/faq/auto-extract-status?file=<path>`

返回指定文件的自动抽取状态。

**参数**：`file` — `.md` 文件的完整路径（URL 编码）

**响应**：

```json
{
  "success": true,
  "file": "/home/zhang/company_knowledge_base/标准规范/GM-T 0054-2018.md",
  "extracted": true,
  "count": 12,
  "last_extracted_at": "2026-06-02 12:30:00"
}
```

未抽取过：
```json
{
  "success": true,
  "file": "...",
  "extracted": false,
  "count": 0,
  "last_extracted_at": null
}
```

**实现逻辑**：`SELECT COUNT(*), MAX(created_at) FROM faq WHERE source_file = ? AND extracted = 1`

### `GET /api/faq/auto-extract-log`

返回自动抽取的操作日志（复用 `logs` 表）。

**参数**：`page`（默认 1）, `limit`（默认 20）

**响应**：
```json
{
  "success": true,
  "logs": [
    {
      "id": 1,
      "username": "auto",
      "action": "faq_auto_extract",
      "detail": "从「GM-T 0054-2018.md」自动抽取 12 条 FAQ",
      "created_at": "2026-06-02 12:30:00"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

**实现逻辑**：`SELECT * FROM logs WHERE action = 'faq_auto_extract' ORDER BY created_at DESC LIMIT ? OFFSET ?`

## 异常处理

- `file` 参数缺失 → 400
- 无日志 → 返回空数组，total: 0
