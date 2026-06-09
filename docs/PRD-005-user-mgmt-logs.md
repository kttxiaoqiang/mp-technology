# PRD-005: 用户管理与操作日志

## Problem Statement

目前 kb-web 只有预设的管理员账号，无法管理多个用户。缺少用户列表、新增用户、编辑用户角色、禁用/启用、重置密码等功能。同时系统缺少操作日志记录，无法追溯谁做了什么事。

## Solution

在左侧导航栏新增「用户管理」「操作日志」两个入口（仅 admin 可见），提供完整的用户生命周期管理功能和操作审计日志。

## User Stories

1. As an admin, I want 用户管理菜单入口（仅管理员可见）， so that 普通用户看不到管理功能
2. As an admin, I want 查看用户列表（用户名、角色、最后登录时间、状态）， so that 了解系统所有用户情况
3. As an admin, I want 添加新用户（用户名、密码、角色）， so that 新人可以登录系统
4. As an admin, I want 编辑用户（修改角色）， so that 可以调整用户权限
5. As an admin, I want 禁用/启用用户， so that 可以临时阻止某用户登录而不删除数据
6. As an admin, I want 重置用户密码， so that 用户忘记密码时可以恢复
7. As an admin, I want 删除用户， so that 可以清理不再需要的账号
8. As an admin, I want 查看操作日志列表， so that 了解系统操作历史
9. As an admin, I want 按操作类型筛选日志（登录、上传、删除、用户管理操作等）， so that 快速定位特定操作
10. As a user, I want 登录/上传/登出等操作被自动记录， so that 操作可追溯
11. As a user, I want 被禁用后无法登录系统， so that 权限管控有效

## Implementation Decisions

### 数据库改动

**users 表** — 新增字段（原有字段保留）：
- `role` → 改为支持 `admin` / `user`（已有 `engineer` 兼容处理）
- `status` → `active` / `disabled`，默认 `active`
- `last_login` → TEXT，最后登录时间

**logs 表** — 新建，字段：
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `user_id` INTEGER → REFERENCES users(id)，可为空
- `username` TEXT → 冗余存储
- `action` TEXT → login / logout / upload / delete / user_create / user_edit / user_disable / user_enable / password_reset
- `detail` TEXT → 操作详情（JSON 格式）
- `ip_address` TEXT → 请求 IP
- `created_at` TEXT → 时间戳

### 服务端 API

**用户管理 API：**
- `GET /api/users` → 返回用户列表（排除 password_hash）
- `POST /api/users` → 创建用户
- `PUT /api/users/:id` → 编辑用户角色
- `PUT /api/users/:id/status` → 启用/禁用
- `PUT /api/users/:id/reset-password` → 重置密码
- `DELETE /api/users/:id` → 删除用户

**日志 API：**
- `GET /api/logs` → 日志列表（支持 action 筛选、分页）
- `GET /api/log-actions` → 返回所有可用的操作类型（供下拉筛选）

**系统修改：**
- 登录成功时记录 `login` 日志 + 更新 `last_login`
- 登出时记录 `logout` 日志
- 文件上传记录 `upload` 日志，文件删除记录 `delete` 日志
- 数据库初始化时 `role` 加入 `user` 类型
- 登录校验增加 `status = 'active'` 判断

### 前端

- 侧边栏加「用户管理」「操作日志」菜单项
- 仅 admin role 显示（client-side 判断 + API 鉴权）
- 用户管理页：表格 + 添加按钮 + 操作列（编辑/禁用/重置密码/删除）
- 禁用按钮 toggle（active↔disabled）
- 重置密码弹窗（管理员输入新密码，不需旧密码）
- 添加用户弹窗（用户名 + 密码 + 角色选择）
- 操作日志页：表格 + 操作类型下拉筛选

### 模块

修改 3 个文件，无新增文件：
- `/home/zhang/kb-web/server.cjs` — 所有 API 端点 + 登录/登出/上传时记录日志
- `/home/zhang/kb-web/public/index.html` — 前端界面全部改动
- `/home/zhang/kb-web/lib/database.cjs` — schema 更新

## Testing Decisions

- 测试使用 Playwright headless 浏览器驱动真实页面
- 测试脚本存 `/tmp/`，以 `tdd_` 前缀命名
- 先测用户管理 API（无需前端），再测前端界面

### 测试策略
- 每个功能点至少 1 个 test assertion
- 异步操作 await 等待 + 适当 timeout
- 测试前后的数据状态要自包含（创建测试数据 → 测试 → 清理或幂等）

### 覆盖范围
- 用户管理 API：CRUD + status toggle + password reset
- 日志 API：列表 + 筛选
- 前端菜单可见性（admin 可见，普通用户不可见）
- 用户管理前端 UI（表格渲染、添加、编辑、禁用、重置密码、删除）
- 日志前端 UI（表格、筛选）
- 登录校验 disabled 用户被拒

## Out of Scope

- 日志导出
- 批量用户操作
- 用户组 / 权限细分（只有 admin / user 两级）
- 登录失败次数限制
- 审计日志保留策略（永久保留）
- 前端不可见字段的自定义（固定显示 username, role, status, last_login, created_at）

## Further Notes

- `engineer` role 兼容为普通 `user`（登录后视为 user 权限）
- 已存在的 testadmin 账号（engineer）迁移后继续可用，显示 role 为普通用户
- bcrypt 已安装，无需新依赖
- `better-sqlite3` 的 `CHECK` 约束更新需 `ALTER TABLE`，通过迁移方式处理
