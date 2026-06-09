Status: ready
Parent: PRD.md
Blocked by: #05-upload-rework, #02-auth-system

## What to build

密评FAQ 独立管理模块。

**API（仅 admin 写操作）：**
- `GET /api/faq` — 全部用户可访问，返回 FAQ 列表（支持搜索和分类过滤）
- `POST /api/faq` — 仅 admin，新增 FAQ（question, answer, category）
- `PUT /api/faq/:id` — 仅 admin，编辑 FAQ
- `DELETE /api/faq/:id` — 仅 admin，删除 FAQ

**前端：**
- FAQ 浏览页面（`/faq`）— 所有用户可访问，展开式问答列表
- FAQ 管理页面（`/admin/faq`）— 仅管理员，表格列表 + 新增/编辑/删除
- 导航栏增加"FAQ"入口（所有用户可见）和"FAQ 管理"入口（仅管理员可见）

新增/编辑 FAQ 使用 Modal 表单。

## Acceptance criteria

- [ ] 普通工程师可浏览 FAQ 列表并展开查看答案
- [ ] FAQ 支持按问题关键词搜索
- [ ] 管理员可新增、编辑、删除 FAQ
- [ ] 新增/编辑使用弹窗表单
- [ ] 导航栏有正确的角色可见入口

## Blocked by

#05-upload-rework, #02-auth-system
