Status: ready
Parent: PRD.md
Blocked by: #02-auth-system

## What to build

管理员用户管理界面和 API。

API：
- `GET /api/admin/users` — 用户列表
- `POST /api/admin/users` — 创建新用户（指定 username, password, role）
- `DELETE /api/admin/users/:id` — 删除用户（不能删除自己）
- 所有接口仅 `admin` 可访问

前端：
- 用户管理页面（`/admin/users`）
- 用户列表表格：用户名、角色、创建时间
- 添加用户表单（用户名、密码、角色选择）
- 删除按钮（二次确认）
- 导航栏上增加"用户管理"入口（仅管理员可见）

## Acceptance criteria

- [ ] 管理员可创建普通工程师账号
- [ ] 管理员可删除用户（不能删自己）
- [ ] 用户列表展示所有非初始用户
- [ ] 普通工程师无法访问用户管理页面和 API
- [ ] 操作写入日志（add_user / delete_user）

## Blocked by

#02-auth-system
