# PRD-007: FAQ 智能抽取 + 批量管理

## Problem Statement

知识库现有「密评FAQ」功能，但只有 3 条测试数据，完全不能实际使用。问题是双重的：

1. **从标准正文自动抽取 FAQ** — 知识库已有 173 个 GM/T 标准规范（`.md` 版），其中有大量可供提炼为 FAQ 的技术条款（如 GM/T 0054 的基本要求、检测标准的关键参数等），但无自动化工具将这些标准中结构化的条款提炼成问答对。
2. **FAQ 批量管理缺失** — 现有 FAQ 功能只有逐条「添加/编辑/删除」，无法进行批量导入、导出、分类管理等操作。即使抽取出条目也无法高效管理。

## Solution

### 1. LLM 驱动的标准→FAQ 自动抽取

- 新增 `POST /api/faq/extract` 端点，接受源文件路径列表，调用 DeepSeek API（兼容 OpenAI 格式）从标准正文中抽取 FAQ 条目
- 用户可在管理后台选择标准文件，配置抽取规则（如按条款、按关键词），预览抽取结果后确认导入
- 上传时自动抽取：上传文档成功后，根据文件类型（标准规范类）触发一次抽取建议

### 2. FAQ 批量管理

- 新增批量删除、批量修改分类、批量导入（CSV/JSON）、批量导出（CSV/JSON）功能
- 管理后台新增复选框选择、全选/反选、工具栏按钮

## User Stories

1. As a 密评从业者, I want to select GM/T 标准规范文件 and click "抽取 FAQ", so that the system automatically extracts structured Q&A pairs from the standard text using LLM.
2. As a 密评从业者, I want to preview the extracted Q&A pairs before importing them, so that I can filter out low-quality or irrelevant entries.
3. As a 密评从业者, I want the system to automatically suggest FAQ extraction when I upload a standard/normative document, so that I don't have to manually trigger it.
4. As a 管理员, I want to select multiple FAQ entries via checkboxes and delete them all at once, so that I can clean up outdated entries efficiently.
5. As a 管理员, I want to select multiple FAQ entries and change their category in one action, so that I can reorganize entries without editing each one individually.
6. As a 管理员, I want to import FAQ entries from a CSV/JSON file, so that I can bulk-load entries prepared offline or from other systems.
7. As a 管理员, I want to export all FAQ entries (or a filtered subset) to CSV/JSON, so that I can back up or share them.
8. As a 管理员, I want to see the source document name linked to each auto-extracted FAQ entry, so that I can trace back to the original standard.
9. As a 密评从业者, I want to browse FAQ entries by category, so that I can quickly find relevant Q&As without searching through all entries.

## Implementation Decisions

### Modules

| Module | Description | Type |
|--------|-------------|------|
| `lib/faq_extract.cjs` | DeepSeek API 包装器：接受 markdown 文本 → 返回 FAQ 条目列表 | 新文件（深模块） |
| `server.cjs` | 新增端点，扩展现有端点 | 修改 |
| `public/index.html` | 管理后台 FAQ 页面扩展 | 修改 |

### `lib/faq_extract.cjs` — 深模块设计

这是本 PRD 的核心深模块。它封装了 LLM 调用的全部复杂性（API 密钥管理、请求构建、重试、响应解析）。

```js
// 公开接口（简单、稳定）
async function extractFaqs(text, options = {}) {
  // text: 标准正文（完整 markdown）
  // options:
  //   - apiKey: DeepSeek API 密钥（优先于环境变量）
  //   - model: 'deepseek-chat'（默认）
  //   - promptTemplate: 自定义 prompt 模板（可选）
  //   - maxPairs: 最大抽取问答对数（默认 50）
  //   - temperature: 0.1（默认，低温度确保一致性）
  //   - onProgress: 进度回调（用于分块处理）
  // Returns: [{ question, answer, category, source_section }]
}

// 辅助模式：按文件批量抽取
async function extractFaqsFromFiles(filePaths, options = {}) {
  // 读取文件 → 组合 → 调用 extractFaqs
}

// 获取可用模型列表
function getAvailableModels() { /* 当前仅 deepseek-chat */ }
```

**设计理由：**
- 单一日志：所有 API 调用和错误集中在 `lib/faq_extract.cjs` 中
- 可测试性：只需 mock HTTP 请求层，无需涉及 Express 路由
- 可重用性：未来可被其他功能（文档摘要、自动标签等）共用
- 配置简单：API 密钥通过请求体传递（使用用户提供的 Key），不存储

### API 端点新增

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/faq/extract` | POST | 接受 `{ files: [...], apiKey, options }`，返回抽取结果 `{ faqs: [...] }` |
| `/api/faq/batch-delete` | POST | 接受 `{ ids: [...] }`，批量删除 FAQ |
| `/api/faq/batch-category` | PUT | 接受 `{ ids: [...], category }`，批量修改分类 |
| `/api/faq/import` | POST | 接受 multipart/form-data（CSV/JSON 文件），批量导入 |
| `/api/faq/export` | GET | 接受 `?format=csv|json&category=xxx`，导出 FAQ |
| `/api/faq/categories` | GET | 返回去重后的分类列表 `["基础","等保",...]` |
| `/api/faq/source-documents` | POST | （可选）接受 `{ text }`，返回推荐分类标签 |

### 数据库变更

`faq` 表新增两列（向后兼容，已有数据不迁移）：

```sql
ALTER TABLE faq ADD COLUMN source_file TEXT DEFAULT '';
ALTER TABLE faq ADD COLUMN source_section TEXT DEFAULT '';
ALTER TABLE faq ADD COLUMN extracted INTEGER DEFAULT 0;
```

- `source_file`: 来源文件名（如 "GMT 0054-2018信息系统密码应用基本要求.md"）
- `source_section`: 来源章节名（如 "7.1 物理和环境安全"）
- `extracted`: 1=自动抽取，0=手动添加/导入

### 前端 UI 变更

**FAQ 管理页面 (`renderAdminFaq`)** 新增：

1. **操作栏**（列表上方）：复选框全选、批量删除按钮、批量分类下拉、导入按钮、导出按钮
2. **分类筛选**：下拉选择分类，过滤显示
3. **列表行**：新增复选框列、来源列、抽取标识列
4. **抽取面板**（独立按钮「AI 抽取 FAQ」）：
   - 弹出对话框显示可选文件列表（仅显示标准规范类 `.md` 文件）
   - 文件选择（多选，含全选）
   - API Key 输入框
   - 抽取按钮
   - 结果预览（问答对列表，带 checkbox 可选导入）
   - 确认导入按钮

**FAQ 浏览页面 (`renderFaq`)** 新增：

5. **分类标签筛选**：显示所有分类标签，点击筛选
6. **来源链接**：如果 FAQ 有 source_file，显示为可点击链接跳转到对应文件

### 上传自动触发抽取

在 `POST /api/upload` 的转换成功后，如果文件被分类为「标准规范」或「密评FAQ」且有 API Key 配置，返回额外的 `extract_suggestion` 字段，前端显示「建议从本文档抽取 FAQ」按钮（不自动导入，由用户确认）。

### 抽取 Prompt 规则

默认抽取规则（通过 prompt 模板实现）：

```
你是一位密码应用安全评估（密评）专家。请从以下标准规范文档中提取重要的问答对。

抽取规则：
1. 只提取与密码应用安全评估直接相关的技术条款、合规要求、检测方法
2. 跳过目录、前言、引言等非实质性内容
3. 每个问答对应一个完整的技术知识点
4. 问题应该直接、具体，使用密评从业者的语言
5. 答案应该引用标准原文条款，标注来源章节
6. 为每个问答对标注分类标签（可选值：基础概念、合规要求、技术标准、检测方法、密钥管理、安全管理、应用场景）

输出格式：JSON 数组
[
  {
    "question": "信息系统密码应用的基本要求有哪些？",
    "answer": "根据 GM/T 0054-2018 第5章，信息系统密码应用的基本要求包括：...",
    "category": "合规要求",
    "source_section": "5 基本要求"
  }
]
```

## Testing Decisions

### 测试原则
- 只测外部行为（HTTP API + 响应），不测内部实现
- lib/faq_extract.cjs 通过 mock HTTP 响应测试
- 前端批量管理操作用 Playwright 端到端测试

### 测试模块

| 模块 | 测试方式 | 测试文件 |
|------|----------|----------|
| `lib/faq_extract.cjs` | 单元测试 + mock fetch | `test/faq-extract.test.cjs` |
| 批量 API (delete/category/import/export) | 集成测试（独立 server） | `test/faq-batch.test.cjs` |
| 前端批量操作 UI | Playwright | `test/faq-batch-ui.mjs` |

### 测试用例

**faq-extract.test.cjs**:
- `extractFaqs` 返回正确的 JSON 数组结构
- 空文本返回空数组
- API 错误返回描述性错误
- API Key 缺失返回 400
- `extractFaqsFromFiles` 读取文件并调用 extractFaqs

**faq-batch.test.cjs**:
- 批量删除：删除多个 id，验证其他条目保留
- 批量修改分类：修改后验证所有条目分类已更新
- 批量导入 CSV：上传 CSV 文件后验证条目数正确
- 批量导入 JSON：与 CSV 相同
- 导出 CSV：验证 Content-Type 和内容格式
- 导出 JSON：验证 JSON 数组格式
- 分类筛选：按分类筛选只返回匹配条目
- 获取分类列表：返回去重分类

## Out of Scope

- RAG / 向量搜索增强的 FAQ（按语义搜索 FAQ — 现有搜索已够用）
- 多轮对话 / FAQ 聊天机器人
- 定时自动抽取（当前仅手动触发 + 上传时建议触发）
- 嵌入/重嵌入现有标准（embeddings 表已有但是为文件搜索设计的）
- FAQ 版本历史/变更追踪
- 标准全文预览仪表盘

## Further Notes

- **API Key 安全**：API Key 通过请求体传递，不在服务端持久化。用户每次使用抽取功能时输入。未来可考虑加密存储到 `kb_data/` 目录下的 `.env` 文件。
- **抽取质量**：首次用 `sk-65e…9cdb` Key 预抽取一批标准，人工审核质量后再调优 prompt。prompt 模板设计为核心可配项，未来可支持用户自定义模板。
- **大文件分块**：标准正文（如 GM/T 0054 约 40KB）在 LLM 上下文窗口内（DeepSeek 支持 32K-128K），不做分块。如果未来有超长标准（>32K tokens），自动按 Markdown 标题分块处理。
- **分类标签规范化**：抽取时 LLM 输出固定标签集（基础概念、合规要求、技术标准、检测方法、密钥管理、安全管理、应用场景），人工无法添加新标签，但可在编辑时修改。
