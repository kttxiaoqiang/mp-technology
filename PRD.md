# PRD: 密码应用知识库 — 搜索下载、分类修复、界面优化

## Problem Statement

知识库系统已于前期完成文件上传（含 MarkItDown 自动转换）、全文搜索（含 QMD 语义搜索）、文件列表展示等核心功能，但存在以下问题：

1. **搜索无法附带原始文件下载**：搜索结果展示的是 .md（MarkDown 转换产物）的片段，用户搜到内容后无法直接下载原始的 .docx/.pdf 源文件；搜索时也只匹配 .md 正文，不匹配原始文件名
2. **分类筛选不生效**：前端「方案/报告/标准法规参考/其他」tab 点击后展示内容无变化，后端 `/api/files` 忽略 `category` 查询参数；大量测试残留文件堆积在根目录导致分类混乱
3. **界面可用性差**：文件列表仅单一列表视图，文件过多时无分页，纯 Tailwind 默认风格不够精致

## Solution

### 1. 搜索附带源文件下载
- 修改 `detectCategory` 行为：支持从 YAML front-matter 解析原始文件路径
- 搜索结果添加 `originalDownloadPath`，指向原始 .docx/.pdf 文件的下载 URL
- 搜索空间扩展为：「.md 正文 + 原始文件名 + 原始文件名关键词」，让用户搜文件名也能命中

### 2. 分类模块修复
- `/api/files` 支持 `?category=` 参数过滤
- 分类 tab 与后端目录对齐：方案 / 报告 / 密评FAQ / 标准规范 / 法规政策 / 参考文档 / 其他
- 清理测试残留文件（删除无用的 `17799xxx_*.txt` 和 `md/`、`store/` 目录）
- 上传逻辑保证未分类文件放进「其他」子目录

### 3. Notion 风格界面
- 默认卡片视图（白底圆角卡片，带图标、分类标签、大小、日期）
- 视图切换按钮：卡片 / 列表
- 分页加载（每页 20 条，加载更多）
- Notion 颜色主题（灰调、无边框阴影、窄间距、中文字体优化）

## User Stories

1. 作为用户，我想要在搜索结果中直接下载原始 .docx/.pdf 文件，以便快速获取可编辑的原始文档
2. 作为用户，我想要搜索关键词时也能匹配原始文件名，以便我通过文件名直接找到文档
3. 作为用户，我想要点击分类 tab 后正确显示该分类下的文件，以便按类型浏览
4. 作为用户，我想要分类 tab 列表覆盖所有实际存在的分类目录，避免有分类点不进去
5. 作为用户，我想要在卡片视图和列表视图之间切换，以便根据场景选择浏览方式
6. 作为用户，我想要文件列表分页展示，避免一次加载全部文件造成页面卡顿
7. 作为管理员，我想要界面看起来整洁专业（Notion 风格），以便提升日常使用体验

## Implementation Decisions

### API 变更

**`GET /api/files`** 新增查询参数：
- `?category=方案`：只返回该分类目录下的文件
- `?page=1&pageSize=20`：分页参数

**`GET /api/search`** 返回结果增强：
- 每条结果新增 `originalDownloadPath` 字段（从 .md YAML front-matter 的 `source:` 解析）
- 搜索范围扩展：在 grep 全文搜索之前，先匹配文件名关键词

### 模块变更

| 模块 | 变更 |
|------|------|
| `server.cjs` — scanFiles | 支持 `category` 过滤参数 |
| `server.cjs` — /api/search | 扩展搜索空间，解析 source 路径 |
| `server.cjs` — upload | 未分类文件移入「其他」子目录 |
| `lib/convert.cjs` | 无变更（detectCategory 关键词规则已够） |
| `public/index.html` | 视图切换、Notion 主题、分页、分类 tab 对齐 |

### 视图切换实现
- 纯 CSS 类切换：`.view-card` vs `.view-list`
- 状态存储于 `App._viewMode`，不持久化
- 卡片视图：flex-col 圆角卡片，带文件类型图标、大小、日期、下载按钮
- 列表视图：保持现有行式布局

### 分页策略
- 前端分页：一次性获取全量（当前文件数 ~100，可接受），前端切片展示
- `renderFileList` 接收 `page` 和 `pageSize`，只渲染当前页
- "加载更多"按钮插入列表末尾

### 清理策略
- 仅删除根目录下符合模式 `^17799\d+_` 的测试文件，保留原始文档
- 删除空的 `md/` 和 `store/` 测试目录

### Notion 主题
- 背景：#f7f8fa（更浅）
- 卡片：white bg，无边框，微弱 shadow
- 字体：`Inter, -apple-system, 'Noto Sans SC'`
- 圆角：8px 卡片，4px 按钮
- 间距：减少内边距，增加文件间距，呼吸感
- 颜色：蓝 #2563eb 为主色，灰 #6b7280 为辅助色

## Testing Decisions

- 全部通过 Playwright 集成测试覆盖（API 行为 + E2E 交互）
- 优先测试**公共接口行为**而非实现细节：
  - `/api/files?category=方案` 只返回方案目录文件
  - `/api/search?q=凡凡` 返回的 `originalDownloadPath` 不为空且可下载
  - 视图切换按钮存在且可点击
  - 分页加载按钮行为正确
- 现有测试随变更同步更新
- 每个功能垂直切片（一个行为 → 一个实现 → 一个测试），不批量写测试

## Out of Scope

- 服务端渲染（当前 SPA 架构保持不变）
- 用户权限分级细化（保持 admin 和 一般用户两级）
- 全文搜索性能优化（当前文件 <200，grep 足够）
- 移动端深度适配（仅保证可用）
- 密评 FAQ 模块的改进（已有独立页面，不动）

## Further Notes

- 清理测试文件前需确认用户当前没有需要保留的测试文件
- 前端 index.html 已较大（~600 行），视图切换将增加 ~100 行 JS/CSS，建议保持单文件 SPA 结构
- Notion 风格逐步迭代，本 PRD 先实现基础版

## Post-Implementation Fixes (2026-05-28)

### 搜索修复 — 4 个 Bug

1. **qmd 路径硬编码错误**：代码写死 `/usr/local/bin/qmd`，但 qmd 安装在 `/usr/bin/qmd`。`fs.existsSync` 检查通不过，Phase 1 QMD 搜索完全跳过。
   - 修复：动态 `execSync('which qmd')` 解析路径

2. **qmd query 超时（60s+）**：`qmd query` 在 CPU-only 环境要跑 60s+，Node.js `execSync` 60秒超时卡死。
   - 修复：改用 `qmd search`（纯 BM25，5s 以内），超时降为 15s

3. **输出格式不兼容**：`qmd query` 输出 `path\t score\t snippet` 制表符格式，`qmd search` 输出多行 `qmd://...` → `Title:` → `Score:` → diff 格式。代码按 `\t` 拆分解析失败。
   - 修复：重写解析逻辑，正确解析 `qmd search` 的逐文件输出结构

4. **中文长短语无全字段匹配**：grep 完整子串匹配 "连云港密评方案" 失败，因为该短语在文档中不作为连续子串出现。
   - 修复：当完整短语不匹配时，使用 2-3 字中文 N-gram 拆分为多个关键词逐词匹配

### 最终搜索架构

```
用户输入 → qmd search (BM25, ~3-5s) → 解析逐文件输出
  → 关键词拆分 grep 兜底（中文 N-gram 拆分）
  → 按 score 降序排列 → QMD 结果（含分值区分）在前，grep 追加
  → 返回 snippet + download_url + category + score + method
```

### 验证结果

- ✅ `凡凡电话` → QMD BM25 语义匹配 `联系我们.md`
- ✅ `连云港密评方案` → 关键词拆分匹配 `方案/连云港市政务云...密码应用方案.md`（+5个其他相关文档）
- ✅ 全量 Playwright 测试 62 pass / 9 skip / 0 fail
