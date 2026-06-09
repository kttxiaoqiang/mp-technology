# 架构评估报告

> 日期: 2026-06-09
> 目标: 分析 kb-web 项目结构，提出可落地的架构优化方案

---

## 一、现状诊断

### 1.1 当前模块结构

```
kb-web/
├── server.cjs              ← 🚨 2395 行单体巨石，包含一切
├── lib/                    ← 辅助模块，边界清晰但未充分利用
│   ├── auth.cjs            ← 浅模块（53 行，仅 bcrypt 对比）
│   ├── convert.cjs         ← ✅ 合理
│   ├── database.cjs        ← ✅ 合理
│   ├── faq_extract.cjs     ← ✅ 合理
│   └── logger.cjs          ← 浅模块（36 行，仅一行封装）
├── routes/                 ← 🗑️ 废弃的占位目录
│   ├── auth.cjs            ← 空占位（27 行注释）
│   └── files.cjs           ← 旧代码，与 server.cjs 功能重叠且不兼容
├── test/                   ← ✅ 测试体系完整
├── tests/                  ← 🚨 与 test/ 重复，历史遗留
├── kb_data/                ← 数据库文件混在项目目录内
├── *.bak / *.fixbak        ← 🗑️ 垃圾文件
├── pcap_analyzer.*         ← 🗑️ 无关文件
├── server_v2.cjs           ← 🗑️ 历史版本
└── dc2.mjs / dc3.mjs       ← 🗑️ 调试脚本
```

### 1.2 关键问题

#### ⚠️ 问题 1：server.cjs 单体巨石 — 严重

**2395 行**，包含：
- 路由注册（~40 个端点）
- Multer 配置
- 中间件（session、静态文件）
- 业务逻辑（文件扫描、搜索、分类、FAQ 提取）
- 数据库查询（内联 SQL）
- HTML 渲染（mdToHtml 函数）
- 外部子进程调用（QMD、pdftotext）
- Mock 和测试辅助代码（行 112-315）
- API Key 注入

**后果**：改一处要读完整文件，测试困难，多人协作不可能。

#### ⚠️ 问题 2：松散碎片 — 中等

| 碎片 | 问题 |
|------|------|
| `routes/` 目录 | 有代码但无人使用，与 server.cjs 重复 |
| `tests/` vs `test/` | 两个测试目录，分裂且不统一 |
| 根目录 `.bak` / `.fixbak` / `server_v2.cjs` | 历史残留，不应在 git 中 |
| `pcap_analyzer.*` / `gen_test_pcap.py` | 与密评知识库项目无关 |
| `kb_data/` | 运行时数据（SQLite）混在源码目录 |

#### ⚠️ 问题 3：浅模块 — 轻微

- `lib/auth.cjs`（53 行）：只有 `comparePassword` + `hashPassword`，纯工具函数
- `lib/logger.cjs`（36 行）：单行导出 `logAction`
- `routes/auth.cjs`（27 行）：纯注释占位

### 1.3 耦合度分析

```
server.cjs
├── lib/convert.cjs     → ✅ 通过解构导入，良好解耦
├── lib/faq_extract.cjs → ✅ 通过解构导入
├── lib/database.cjs    → ⚠️ 内联 require（行 99/161/270/934/1461/1504）
│                          🚨 每次调用都重新 require，既浪费又脆弱
├── lib/auth.cjs        → ⚠️ server.cjs 行 161/200/271 自己 require bcrypt
│                          不走 lib/auth.cjs 封装
└── lib/logger.cjs      → ⚠️ server.cjs 行 1781-1816 自己实现 logAction
                          不走 lib/logger.cjs
```

---

## 二、改进方案

### 2.1 目标结构

```
kb-web/
├── src/
│   ├── index.cjs              → 启动入口（~50 行）
│   ├── app.cjs                → Express 应用组装（~100 行）
│   ├── config.cjs             → 配置集中管理
│   ├── middleware/
│   │   ├── auth.cjs           → requireAdmin, session 检查
│   │   ├── upload.cjs         → Multer 配置
│   │   └── logger.cjs         → 请求日志中间件
│   ├── routes/
│   │   ├── auth.cjs           → 登录/登出/修改密码
│   │   ├── files.cjs          → 文件 CRUD · 搜索 · 批量
│   │   ├── faq.cjs            → FAQ CRUD · 提取 · 批量
│   │   ├── preview.cjs        → Markdown 预览 · 图片
│   │   ├── admin.cjs          → 用户管理 · 操作日志
│   │   └── stats.cjs          → 仪表盘 · 热词统计
│   ├── services/
│   │   ├── file-service.cjs   → 文件扫描 · 分类 · 搜索逻辑
│   │   ├── faq-service.cjs    → FAQ 提取 · 批量操作
│   │   ├── convert-service.cjs→ 文档转换编排
│   │   └── search-service.cjs → 全文 / 混合搜索
│   ├── lib/
│   │   ├── database.cjs       ← 保留
│   │   ├── auth.cjs           ← 保留（扩展）
│   │   ├── convert.cjs        ← 保留（rename）
│   │   └── faq_extract.cjs    ← 保留
│   └── utils/
│       ├── logger.cjs         → 日志工具
│       ├── helpers.cjs        → mdToHtml, parseYamlFrontMatter 等
│       └── qmd.cjs            → QMD 子进程调用封装
├── data/                      → 运行时数据（gitignored）
│   └── kb.db
├── test/                      → 合并 tests/ 进来
├── public/                    ← 保留
└── docs/                      ← 保留
```

### 2.2 迁移步骤（按风险排序）

#### 第 1 步 🟢 低风险 — 清理孤儿文件

```bash
# 删除历史残留
rm server.cjs.bak server.cjs.fixbak server_esm.js.bak
rm server_v2.cjs server_v2.cjs.bak server_clean.cjs server_new.cjs
rm server-broken.cjs server.log
rm login-screenshot.cjs debug-page.cjs
rm dc2.mjs dc3.mjs
rm pcap_analyzer.py gen_test_pcap.py start_pcap.sh setup.sh
```

#### 第 2 步 🟢 低风险 — 统一配置

新建 `src/config.cjs`，将 `KB_PATH`、`PORT`、`DEEPSEEK_API_KEY`、`MAX_FILE_SIZE`、`CATEGORIES`、`VALID_CATEGORIES` 集中管理。

#### 第 3 步 🟡 中风险 — 提取路由模块

按功能拆分为 6 个路由文件，每个接管 server.cjs 中对应的一组端点。这是最重要的解耦步骤。测试可以逐路由切换，不影响整体。

#### 第 4 步 🟡 中风险 — 提取 service 层

将文件扫描、搜索、FAQ 提取等业务逻辑从路由 handler 中剥离到 `services/`，使其可独立测试。

#### 第 5 步 🟢 低风险 — 合并 test 目录

将 `tests/` 中的有效测试合并到 `test/`，删除 `tests/` 目录。

### 2.3 不可行的改进（暂不推荐）

- **用 TypeScript**：当前纯 JS 架构，全量迁移成本高，收益有限
- **换数据库**：SQLite 够用，知识库场景无高并发需求
- **上 React/Vue**：SPA 已经用原生实现，框架迁移无业务收益

---

## 三、测试接缝建议

| 接缝 | 方式 | 测试内容 |
|------|------|---------|
| `searchMdFiles()` | 纯函数，传入文件路径数组 + query | 搜索排序、分类过滤 |
| `extractFaqs(text)` | 纯函数，mock DeepSeek API | 解析 LLM 返回 |
| `detectCategory(name)` | 纯函数 | 关键词匹配逻辑 |
| `scanFiles(dir)` | 纯函数，mock fs | 目录遍历 + 缓存 |
| 每个 route handler | supertest | HTTP 状态码 + 响应体 |
| QMD 调用 | mock execSync | 命令构建 + 结果解析 |

---

## 四、总结

| 维度 | 当前 | 改进后 |
|------|------|--------|
| server.cjs 行数 | 2395 | ~50（仅启动） |
| 模块数 | 6 个 lib + 1 个巨石 | ~20 个职责清晰的模块 |
| 路由耦合 | 巨石内联 | 6 个独立路由文件 |
| 配置管理 | 散布文件各处 | 集中 config.cjs |
| 测试覆盖 | 57 API + 15 UI | 可增加 service 层纯函数测试 |
| 总行数变化 | — | 略有增加（拆分的结构成本） |
