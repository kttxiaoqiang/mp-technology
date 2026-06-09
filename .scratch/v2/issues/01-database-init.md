Status: ready
Parent: PRD.md
Blocked by: None — can start immediately

## What to build

数据库初始化 + 首次启动设置。

创建 `kb_data/` 数据目录，用 SQLite 自动建表：
- `users`（id, username, password_hash, role, created_at）
- `files`（id, original_name, storage_path, md_path, category, file_size, mime_type, uploaded_by, created_at）
- `logs`（id, user_id, action, detail, created_at）
- `faq`（id, question, answer, category, created_by, updated_at, created_at）

首次启动时自动建表。同时自动创建一个初始管理员账号（用户名 + 密码通过首次启动时在控制台交互创建或使用默认环境变量）。

依赖：`better-sqlite3`（本地编译需要 node-gyp 和 python，已确认环境可用）、`bcryptjs`（纯 JS，免编译）

## Acceptance criteria

- [ ] 启动后在 `kb_data/` 目录生成 `kb.db` SQLite 文件
- [ ] 所有表结构符合 PRD 设计
- [ ] 首次启动交互式创建初始管理员账号
- [ ] 第二次启动不再要求创建，直接使用已有账号
- [ ] 加密方式为 bcrypt

## Blocked by

None — can start immediately
