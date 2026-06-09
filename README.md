# MP-Technology — 企业密码应用知识库系统

面向**密码应用安全评估（密评）**领域的文档知识库管理系统。支持多格式文档上传、自动转换 Markdown、全文+语义混合搜索、AI 自动分类与 FAQ 提取，内置用户权限和操作审计日志。

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速部署](#快速部署)
- [API 接口](#api-接口)
- [测试](#测试)

---

## 功能概览

| 功能 | 说明 |
|------|------|
| 文档上传 | PDF / Word / Excel / TXT / HTML，自动转换为 Markdown |
| 自动分类 | 关键词 + DeepSeek AI 归类（方案/报告/密评FAQ/标准规范/法规政策/参考文档） |
| 混合搜索 | QMD 向量语义检索 + 全文 grep 智能合并，中文子词评分 |
| AI FAQ 提取 | DeepSeek API 自动从文档提取问答对 |
| Markdown 预览 | 表格渲染、图片相册、全屏查看 |
| 用户管理 | admin/user 角色，启用/禁用，重置密码 |
| 操作审计 | 全量操作日志记录与筛选 |
| 测试覆盖 | 57 项 API 测试 + 15 项 UI 端到端测试 |

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js ≥ 18（推荐 22），Python 3.8+ |
| 后端 | Express + SQLite（better-sqlite3） |
| 向量检索 | QMD（@tobilu/qmd）— Embedding + Reranker + Query Expansion 本地化三模型流水线 |
| 文档转换 | MarkItDown（Python）+ LibreOffice fallback |
| AI 集成 | DeepSeek API（文档分类 + FAQ 自动提取） |
| 搜索 | 全文 grep + QMD 语义混合检索，自动降级与去重合并 |
| 前端 | 原生 HTML/CSS/JS，Hash-based SPA，无框架依赖 |
| 测试 | Node.js assert（API 测试）× Playwright（UI 端到端） |
| 部署 | systemd user service，crontab keepalive |

## 目录结构

```
kb-web/
├── server.cjs               # 主服务（2395 行）
├── package.json
├── .env                     # 环境变量（不提交）
├── .env.example             # 配置模板
│
├── public/
│   └── index.html           # SPA 前端（3189 行）
│
├── lib/
│   ├── convert.cjs          # 文档转换：MarkItDown + LibreOffice
│   ├── convert_markitdown.py
│   ├── database.cjs         # SQLite 初始化与迁移
│   ├── faq_extract.cjs      # DeepSeek FAQ 提取
│   ├── auth.cjs             # 认证模块
│   └── logger.cjs           # 操作日志
│
├── test/
│   ├── run-all.mjs          # 测试入口
│   ├── database.test.cjs    #  8 ✅
│   ├── auth.test.cjs        # 11 ✅
│   ├── faq-extract.test.cjs # 11 ✅
│   ├── faq-batch.test.cjs   #  8 ✅
│   ├── file-batch.test.cjs  #  8 ✅
│   ├── batch-upload.test.cjs#  6 ✅
│   └── ...                  # 共 28 个文件
│
├── keepalive.sh             # crontab 保活脚本
└── .gitignore
```

## 快速部署

### 一、前置要求

| 组件 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | ≥ 18（推荐 22） | 运行服务 |
| Python | ≥ 3.8 | MarkItDown 文档转换 |
| LibreOffice | 可选 | docx/xlsx fallback 转换 |
| g++ / CMake | ≥ 9 / ≥ 3.16 | QMD 编译（可选） |
| DeepSeek API Key | 可选 | AI 分类 + FAQ 提取 |

> 国内环境使用 QMD 模型下载需配置 `HF_ENDPOINT=https://hf-mirror.com`

### 二、安装

#### 2.1 安装系统依赖（Ubuntu）

```bash
# Node.js v22（如未安装）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash
sudo apt-get install -y nodejs

# 构建工具（better-sqlite3 编译用）
# Python 3（MarkItDown 文档转换）
# LibreOffice（docx/xlsx 回退转换，可选）
sudo apt-get install -y build-essential python3 python3-pip libreoffice-core libreoffice-writer libreoffice-calc
```

#### 2.2 项目依赖

```bash
# 1. 克隆
git clone https://github.com/kttxiaoqiang/mp-technology.git
cd mp-technology

# 2. Node.js 依赖
npm install

# 3. Python 依赖（文档转换）
python3 -m pip install markitdown
```

### 三、配置

```bash
cp .env.example .env
```

编辑 `.env`：

```
DEEPSEEK_API_KEY=sk-你的key       # 必填（未填则 AI 功能不可用）
KB_PATH=/data/knowledge_base       # 可选，默认 /home/zhang/company_knowledge_base
PORT=3344                          # 可选，默认 3344
```

### 四、安装 QMD（可选，建议安装）

提供向量语义检索能力，不装则搜索退化为纯全文 grep。

```bash
npm install -g @tobilu/qmd

# 下载模型（国内用镜像）
HF_ENDPOINT=https://hf-mirror.com qmd pull embeddinggemma-300M-Q8_0
HF_ENDPOINT=https://hf-mirror.com qmd pull Qwen3-Reranker-0.8b-q8_0
HF_ENDPOINT=https://hf-mirror.com qmd pull query-expansion-1.7B-q4_k_m

# 初始化知识库索引
qmd embed /home/zhang/company_knowledge_base
```

> g++ 9.4 下 QMD 编译需将 `binding.gyp` 中 `-std=c++20` 改为 `-std=c++2a`。

### 五、启动

```bash
# 初始化数据库（首次启动会自动执行）
node lib/database.cjs init

# 启动（前台）
node server.cjs
# → http://localhost:3344

# 后台运行
nohup node server.cjs > /tmp/kb-web.log 2>&1 &
```

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 登录 |
| POST | `/api/logout` | 登出 |

### 文件

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files` | 文件列表（按分类分组） |
| POST | `/api/upload` | 上传文件 |
| POST | `/api/upload-text` | 上传纯文本 |
| DELETE | `/api/delete` | 删除文件 |
| GET | `/api/download/*` | 下载原始文件 |

### 搜索与预览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/search` | 全文搜索 |
| GET | `/api/hybrid-search` | 混合搜索（语义 + 全文） |
| GET | `/api/preview` | Markdown 预览（HTML + 关联图片） |

### FAQ

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/faq` | FAQ 增删改查 |
| POST | `/api/faq/extract` | AI 自动提取 FAQ |

### 管理（admin 权限）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 用户列表 |
| POST | `/api/users` | 创建用户 |
| GET | `/api/logs` | 操作日志 |

## 测试

```bash
node test/run-all.mjs --server
```

```
57/57 API 测试 ✅  15/15 UI 测试 ✅
├── database       →  8 ✅
├── auth           → 11 ✅
├── faq-extract    → 11 ✅
├── auto-faq       →  9 ✅
├── file-batch     →  8 ✅
├── batch-upload   →  6 ✅
└── faq-batch      →  8 ✅
```

## License

MIT
