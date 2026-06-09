# ISSUE-9.1: 上传完成后台异步 FAQ 抽取

## 关联 PRD
PRD-009 — 上传自动抽取 FAQ

## 目标
在 `POST /api/upload` 流程中，文件转换 + 分类完成后，异步调用 DeepSeek API 从 Markdown 正文中抽取 FAQ 条目并写入 `faq` 表。

## 改动范围

### server.cjs

**上传流程修改** (`POST /api/upload`)：

1. 转换完成、确定分类后，如果分类不是 `方案` 且不是 `报告`：
   - 在响应中加入 `extraction_status: "pending"`
   - 用 `setImmediate()` 启动后台异步任务
2. 异步任务逻辑：
   - 读取 `.md` 文件内容
   - 去掉 YAML front-matter
   - 调用 `lib/faq_extract.cjs` 的 `extractFaqs()`
     - 传入 `apiKey`（从环境变量或硬编码常量读取）
   - 对返回的每个 FAQ 条目：
     - 关联 `source_file`（`.md` 文件名）
     - 设置 `extracted = 1`
     - 写入 `faq` 表
   - 如果该 `.md` 文件已有旧的自动抽取记录（`source_file = 文件名 AND extracted = 1`），先删除旧的再写入新的
   - 记录操作日志：`faq_auto_extract`
3. 异常处理：
   - 任何异常（API 调用失败、JSON 解析失败、DB 写入失败）均记录错误日志，不阻塞上传响应

**新增常量/环境变量** (`server.cjs` 顶部)：

```js
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-65eb47b7cb694fa7a389b4c66a6b9cdb';
```

**上传响应变更**：

```json
{
  "success": true,
  "convertedToMd": true,
  "category": "标准规范",
  "extraction_status": "pending",
  "extraction_status_skipped": false,
  "file": { ... }
}
```

如果分类是 `方案`/`报告`：
```json
{
  "success": true,
  "extraction_status": "skipped",
  "skip_reason": "文件分类为「方案」，跳过 FAQ 抽取",
  ...
}
```

### lib/database.cjs

无变更（`faq` 表已有 `source_file`, `source_section`, `extracted` 列）。

### 错误兜底

- DeepSeek API key 为空字符串：静默跳过，`extraction_status: "skipped"`, 日志记录
- LLM 返回非 JSON 内容：记录错误日志，不阻塞上传
- DB 写入失败：记录错误日志

## 依赖

- `lib/faq_extract.cjs`（已有，无需修改）
- 无新 npm 包（用 Node.js 内置 `fetch`）

## 测试策略

- 集成测试：mock fetch 拦截 DeepSeek API 调用 → 验证 FAQ 写入 `faq` 表
- 上传后验证 `extraction_status` 字段
- 方案/报告文件上传 → 验证 `"skipped"`
