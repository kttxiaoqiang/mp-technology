Status: ready
Parent: PRD.md
Blocked by: #01-database-init

## What to build

Session-based 登录认证系统。

- 用 `express-session` + 自定义 SQLite session store（基于已有的 `better-sqlite3`）
- 登录页面：用户名 + 密码表单，提交到 `/api/auth/login`
- 登出：`/api/auth/logout`
- 获取当前用户信息：`/api/auth/me`
- 密码用 bcryptjs 验证

权限中间件 `requireRole(...roles)`：
- 未认证 → 401
- 角色不匹配 → 403

所有 API 路由加上角色保护（先保护现有路由，后续路由在对应 issue 里补充）。

前端：当前 index.html 需要改造——检查 cookie，未登录重定向到登录页面。使用原生 JS + fetch API，不引入前端框架。

## Acceptance criteria

- [ ] `/login` 页面可用，登录成功跳转到首页
- [ ] 未登录用户访问首页自动跳转回 `/login`
- [ ] `/api/auth/me` 返回当前用户信息（username, role）
- [ ] 权限中间件正确阻断越权访问
- [ ] 登出后 session 清除

## Blocked by

#01-database-init
