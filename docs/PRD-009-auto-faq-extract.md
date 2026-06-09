# PRD-009: 上传自动抽取 FAQ（AI 驱动）

## Problem Statement

现有 FAQ 系统依赖人工手动触发抽取（`POST /api/faq/extract`），操作步骤多、覆盖范围有限。知识库中大量非「方案」「报告」类文档（标准规范、法规政策、参考文档等）包含可提炼为 FAQ 的技术内容，但因为需要手动操作而长期未被抽取。

用户需要在上传文件时**自动**完成 FAQ 抽取，让知识库的 FAQ 条目随文档入库自然增长，无需额外人力操作。

## Solution

在文件上传流程中增加**异步 AI 抽取步骤**：

1. 文件上传 + 文档转换完成后 → 判断文件分类
2. 如果分类**不是**「方案」或「报告」→ 触发后台异步任务，调用 DeepSeek API 抽取 FAQ
3. 抽取结果自动写入 `faq` 表，关联 source_file 和 source_section
4. 用户无感知（不阻塞上传响应），但可查看抽取结果和日志

## User Stories

1. As a 密评从业者, I want newly uploaded documents (excluding 方案/报告) to be automatically scanned for FAQ-worthy content, so that the FAQ database grows without manual effort.
2. As a 管理员, I want to see which files have been automatically extracted and how many entries were produced, so that I can monitor the extraction quality.
3. As a 管理员, I want the extraction to run in the background so that uploading documents is not delayed by AI API calls.

## Implementation Decisions

### 触发条件

上传 → 转换完成 → 分类：
- 分类为 `方案` → 跳过
- 分类为 `报告` → 跳过
- 其他所有分类 → 触发异步抽取

### 异步抽取流程

```
POST /api/upload (同步, 返回文件信息)
  └→ 后台 setImmediate/process.nextTick:
      1. 读取 .md 文件正文（去掉 YAML front-matter）
      2. 构造 prompt（同 PRD-007 格式）
      3. 调用 DeepSeek Chat API（流式/非流式）
      4. 解析返回的 JSON 问答数组
      5. 逐条写入 faq 表（source_file=文件名, extracted=1）
      6. 记录抽取日志（条目数 + 成功/失败）
         └→ log action: "faq_auto_extract"
```

### API Key 配置

Key 写入 `server.cjs` 的环境变量（不通过请求体传入，因为是自动过程）：

```js
// server.cjs 顶部
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-65eb47b7cb694fa7a389b4c66a6b9cdb';
```

### 数据库

复用现有 `faq` 表（已有 `source_file`, `source_section`, `extracted` 列）。

新增操作日志类型：`faq_auto_extract`

### 错误处理

- API 调用失败：记录错误日志，不阻塞上传
- 返回 JSON 解析失败：记录日志
- 空结果：记录日志（非错误），不写入
- 重复抽取：同一个 `.md` 文件再次上传时，清空旧抽取结果重新抽取

### 前端变更最小化

- FAQ 管理页面加一个「自动抽取日志」标签（可选）
- 文件详情中显示抽取状态（已抽取 N 条 / 未抽取 / 失败）

### Prompt 模板

复用 PRD-007 的默认 prompt，结果格式保持一致（`[{question, answer, category, source_section}]`）。

## API 变更

| 端点 | 变更 |
|------|------|
| `POST /api/upload` | 响应新增 `extraction_status` 字段：`"pending"`, `"skipped"` |

新增端点：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/faq/auto-extract-status` | GET | `?file=<path>` 返回该文件的抽取状态 |
| `/api/faq/auto-extract-log` | GET | 返回自动抽取日志列表（带分页） |

## Out of Scope

- 定时全量扫描抽取（仅在上传时触发）
- 人工审核工作流（抽取即入库，用户可在 FAQ 管理页修改/删除）
- 增量抽取（同一个文件修改后重新上传，全量重新抽取）
- 多模型选择（固定用 DeepSeek Chat）

## Testing

- 后端集成测试：mock DeepSeek API → 验证 FAQ 写入 `faq` 表
- 上传测试：上传非「方案/报告」文件 → 验证 `extraction_status` 字段
- 跳过测试：上传「方案」文件 → 验证 `"skipped"` 状态
