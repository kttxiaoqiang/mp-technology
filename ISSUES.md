# Issues — 密码应用知识库改进

基于 PRD.md 拆解为垂直切片。

---

## Issue 1: `/api/files` 支持 category 过滤 + 分类 tab 对齐

**Type:** AFK  
**Blocked by:** None  
**User stories:** 3, 4  

### What to build

修改 `GET /api/files` 处理 `?category=` 参数，只返回该分类目录下的文件。同时对齐前端分类 tab 与后端文件目录（方案/报告/密评FAQ/标准规范/法规政策/参考文档/其他），保证 tab 点击后文件列表正确切换。

### Acceptance criteria

- [ ] `GET /api/files?category=方案` 仅返回 `方案/` 子目录下的文件
- [ ] `GET /api/files?category=其他` 仅返回 `其他/` 子目录下的文件（含未分类文件）
- [ ] `GET /api/files`（无参数）行为不变，返回全部
- [ ] 前端 tab 列表更新为：方案 / 报告 / 密评FAQ / 标准规范 / 法规政策 / 参考文档 / 其他
- [ ] 点击每个 tab 正确筛选

---

## Issue 2: 清理测试残留文件

**Type:** AFK  
**Blocked by:** None  
**User stories:** 3, 4  

### What to build

删除根目录下测试上传产生的 `17799xxx_*.txt` 等残留文件，删除 `md/` 和 `store/` 测试目录。将根目录下的原始文档按文件名关键词分入对应子目录（已有 `detectCategory` 逻辑）。确保上传逻辑把未识别的文件移入「其他」子目录而非留根。

### Acceptance criteria

- [x] 所有 `17799xxx_*` 文件被删除
- [x] `md/` 和 `store/` 目录被删除
- [x] 清理后文件分类数合理（方案/报告/标准规范/法规政策/密评FAQ/参考文档/其他各归其位）
- [x] 新上传的文件，`detectCategory` 返回"其他"时存入 `其他/` 子目录而非根目录
- [x] 测试验证上传后文件不在根目录

---

## Issue 3: 搜索结果附带原始文件下载 + 文件名搜索

**Type:** AFK  
**Blocked by:** None  
**User stories:** 1, 2  

### What to build

修改 `/api/search`，为每条搜索结果生成 `originalDownloadPath`：从 .md 文件头部的 YAML front-matter 解析 `source:` 字段，构造原始文件的下载 URL。同时扩展搜索范围，在 grep 全文搜索前先匹配文件名关键词（这样搜"方案"能命中存为 `.docx` 但 `.md` 版本不含"方案"的文件）。

### Acceptance criteria

- [x] 搜索结果中 `.md` 文件带 `originalDownloadPath`（指向原始 .docx/.pdf 等源文件）
- [x] 没有 source 的 `.md` 文件不产生 `originalDownloadPath`
- [x] 搜索关键词时能匹配原始文件名（不只是 .md 内容）
- [x] 前端搜索结果卡片显示下载按钮/链接
- [x] 下载按钮的 URL 可实际下载到原始文件

---

## Issue 4: Notion 风格 + 卡片视图 + 分页

**Type:** AFK  
**Blocked by:** Issue 1（分类 tab 先改好，再调整页面布局）  
**User stories:** 5, 6, 7  

### What to build

改造前端 SPA 界面为 Notion 风格主题。添加卡片/列表视图切换按钮。文件列表实现前端分页（每页 20 条 + "加载更多"）。Notion 风格包括：灰白背景 #f7f8fa、白底圆角卡片（8px）、Inter 字体、蓝 #2563eb 主色、微阴影、窄间距节奏。

### Acceptance criteria

- [x] 视图切换按钮（卡片/列表）存在且可点击
- [x] 卡片视图：白底圆角卡片，带文件类型图标、分类标签、大小、日期、下载/删除按钮
- [x] 列表视图：保持现有行式布局但应用新的颜色主题
- [x] 默认显示 20 条，底部"加载更多"按钮
- [x] Notion 风格主题生效（颜色、字体、间距、圆角符合文档描述）
- [x] 视图切换不重新加载数据（纯 CSS 切换）
- [x] 密评 FAQ 页面也应用新主题

---

## Dependencies 图

```
Issue 1 (category filter) ──→ Issue 4 (UI theme + view toggle)
Issue 2 (cleanup)         ──┘        
Issue 3 (search download) ──→ 与 Issue 1/4 无依赖，可并行
```

所有 Issue 可同时开始，Issue 4 依赖 Issue 1 的分类 tab 结果。

---

## Issue 6 (PRD-006): 批量上传目录

**Parent:** `docs/PRD-006-batch-upload.md`

| Issue | Type | Blocked by | 状态 |
|-------|------|------------|------|
| 6.1 `POST /api/upload-batch` 后端端点 | AFK | None | ✅ 已实现 |
| 6.2 前端目录选择 + 进度展示 UI | AFK | None | ✅ 已实现 |
| 6.3 批量上传功能测试套件 | AFK | 6.1 | ✅ 已实现 |

### Dependencies 图

```
Issue 6.1 (API) ──→ Issue 6.3 (Tests)
Issue 6.2 (UI)   ──→ 与 6.1/6.3 可并行
```

---

## Issue 7 (PRD-007): FAQ 智能抽取 + 批量管理

**Parent:** `docs/PRD-007-faq-extract-batch.md`

| Issue | Type | Blocked by | 状态 |
|-------|------|------------|------|
| 7.1 `lib/faq_extract.cjs` 智能抽取模块 | AFK | None | ✅ 已实现 |
| 7.2 后台批量管理 API 端点 | AFK | 7.1 | ✅ 已实现 |
| 7.3 前端批量管理 UI | AFK | 7.2 | ✅ 已实现 |
| 7.4 批量管理 + 抽取测试套件 | AFK | 7.2 | ✅ 已实现 |

### Dependencies 图

```
Issue 7.1 (抽取模块) ──→ Issue 7.2 (API) ──→ Issue 7.3 (UI)
                                              ──→ Issue 7.4 (Tests)

## PRD-009: 上传自动 FAQ 抽取（AI 驱动）

| Issue | 文件 | 描述 | 状态 |
|-------|------|------|------|
| 9.1 | `server.cjs` | 上传后异步调用 DeepSeek API 抽取 FAQ | ✅ Done |
| 9.2 | `server.cjs` | `auto-extract-status` + `auto-extract-log` 端点 | ✅ Done |
| 9.3 | `index.html` | 前端抽取状态展示 | ⏳ Pending |
| 9.4 | `test/` | 集成测试（mock DeepSeek API） | ✅ Done |
```
