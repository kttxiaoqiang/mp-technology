# MP-Technology — 企业密码应用知识库系统

企业级文档知识库管理系统，面向**密码应用安全评估（密评）**领域。支持多格式文档上传、自动转换 Markdown、全文+语义混合搜索、AI 自动分类与 FAQ 提取，内置用户权限管理和操作审计日志。

## 功能概览

| 功能 | 说明 |
|------|------|
| 📄 文档上传 | 支持 PDF / Word / Excel / TXT / HTML，自动转换为 Markdown |
| 🏷️ 自动分类 | 按关键词 + DeepSeek AI 归类到 `方案/报告/密评FAQ/标准规范/法规政策/参考文档` |
| 🔍 混合搜索 | QMD 向量语义检索 + 全文 grep 智能合并，支持中文子词评分 |
| 🤖 AI FAQ 提取 | DeepSeek API 自动从文档提取问答对 |
| 👥 用户管理 | admin/user 角色，启用/禁用，重置密码 |
| 📋 操作审计 | 全量操作日志记录与筛选 |
| 🖼️ Markdown 预览 | 表格渲染、图片相册、全屏查看 |
| 🧪 测试覆盖 | 57 项 API 测试 + 15 项 UI 端到端测试 |

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express (CommonJS) |
| 数据库 | SQLite（better-sqlite3） |
| 向量检索 | QMD（@tobilu/qmd）— Embedding + Reranker + Query Expansion 本地化流水线 |
| 文档转换 | MarkItDown（Python）+ LibreOffice fallback |
| AI 集成 | DeepSeek API（文档分类 + FAQ 提取） |
| 搜索 | 全文 grep + QMD 语义混合检索 |
| 前端 | 原生 HTML/CSS/JS（Hash-based SPA，无框架依赖） |
| 测试 | Node.js assert（API）× Playwright（UI 端到端） |
| 部署 | systemd user service + crontab keepalive |

## 目录结构

```
kb-web/
├── server.cjs              # 主服务入口
├── package.json
├── .env                    # 环境变量（不提交）
├── .env.example            # 环境变量模板
├── public/
│   └── index.html          # SPA 前端（3189 行）
├── lib/
│   ├── convert.cjs         # 文档转换模块
│   ├── convert_markitdown.py  # MarkItDown Python 脚本
│   ├── database.cjs        # SQLite 数据库初始化与迁移
│   ├── faq_extract.cjs     # DeepSeek FAQ 提取模块
│   ├── auth.cjs            # 认证模块
│   └── logger.cjs          # 操作日志模块
├── test/
│   ├── run-all.mjs         # 测试入口
│   ├── database.test.cjs
│   ├── auth.test.cjs
│   ├── faq-extract.test.cjs
│   ├── faq-batch.test.cjs
│   ├── file-batch.test.cjs
│   └── ...                 # 共 28 个测试文件（含截图工具）
├── keepalive.sh            # crontab 进程保活脚本
└── .gitignore
```

## 快速开始

### 前置要求

- **Node.js** ≥ 18（推荐 22）
- **Python** 3.8+（用于 MarkItDown 文档转换）
- **LibreOffice**（可选，docx/xlsx fallback 转换）
- **DeepSeek API Key**（可选，AI 分类与 FAQ 提取需要）
- **QMD 依赖**（向量检索）：g++ ≥ 9、CMake ≥ 3.16（国内需配置 `HF_ENDPOINT=https://hf-mirror.com` 镜像）

### 1. 克隆与安装

```bash
git clone https://github.com/kttxiaoqiang/mp-technology.git
cd mp-technology

# 安装 Node.js 依赖
npm install

# 安装 Python 依赖（MarkItDown）
pip install markitdown
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入必要的配置：

```
DEEPSEEK_API_KEY=sk-你的key
# KB_PATH=/path/to/your/knowledge_base   # 知识库路径，默认 /home/zhang/company_knowledge_base
# PORT=3344                                # 服务端口
```

> **注意**：如果不配置 `DEEPSEEK_API_KEY`，AI 分类和 FAQ 提取功能将不可用，其余功能正常。

### 3. 安装 QMD（向量检索，可选）

```bash
npm install -g @tobilu/qmd

# 国内需使用镜像源下载模型
HF_ENDPOINT=https://hf-mirror.com qmd pull embeddinggemma-300M-Q8_0
HF_ENDPOINT=https://hf-mirror.com qmd pull Qwen3-Reranker-0.8b-q8_0
HF_ENDPOINT=https://hf-mirror.com qmd pull query-expansion-1.7B-q4_k_m

# 初始化知识库索引
qmd embed /home/zhang/company_knowledge_base
```

> **注意**：不安装 QMD 不影响基本功能，只是搜索会退化为纯全文 grep（语义检索不可用）。
> QMD 编译需要 g++ ≥ 9，g++ 9.4 需手动将 `binding.gyp` 中的 `-std=c++20` 改为 `-std=c++2a`。

### 4. 初始化数据库

首次启动会自动初始化数据库。也可以手动执行：

```bash
node lib/database.cjs init
```

按照提示创建管理员账号。

### 4. 启动服务

```bash
node server.cjs
```

或使用 npm start：

```bash
npm start
```

默认端口 **3344**。访问 `http://localhost:3344/` 即可使用。

### 5. 后台运行

```bash
nohup node server.cjs > /tmp/kb-web.log 2>&1 &
```

### 6. 运行测试

```bash
node test/run-all.mjs --server
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 用户登录 |
| POST | `/api/logout` | 用户登出 |
| GET | `/api/files` | 文件列表（按分类分组） |
| POST | `/api/upload` | 上传文件 |
| POST | `/api/upload-text` | 上传纯文本 |
| DELETE | `/api/delete` | 删除文件 |
| GET | `/api/search` | 全文搜索 |
| GET | `/api/hybrid-search` | 混合搜索（语义+全文） |
| GET | `/api/preview` | Markdown 预览（HTML + 关联图片） |
| GET | `/api/download/*` | 下载原始文件 |
| GET/POST | `/api/faq` | FAQ 增删改查 |
| POST | `/api/faq/extract` | AI 自动提取 FAQ |
| GET | `/api/users` | 用户列表（admin 权限） |
| POST | `/api/users` | 创建用户（admin 权限） |
| GET | `/api/logs` | 操作日志（admin 权限） |

## 测试状态

```
测试通过: 57/57 API + 15/15 UI
├── database   →  8 ✅
├── auth       → 11 ✅
├── faq-extract→ 11 ✅
├── auto-faq   →  9 ✅
├── file-batch →  8 ✅
├── batch-upload→ 6 ✅
└── faq-batch  →  8 ✅
```

## License

MIT
