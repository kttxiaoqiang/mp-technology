Status: ready
Parent: PRD.md
Blocked by: #02-auth-system, #05-upload-rework

## What to build

UI 整体改版，从单页应用改为多页导航式应用。

**导航栏设计：**
```
[密码应用知识库]  [搜索框 ▸]  [分类筛选 ▼]
                                              [用户名 ▼]
                                              ├ FAQ
                                              ├ ─────
                                              ├ 用户管理  ← 仅 admin
                                              ├ 操作日志  ← 仅 admin
                                              ├ FAQ 管理  ← 仅 admin
                                              └ 退出登录
```

**页面路由（前端 SPA 结构，Hash-based）：**
- `#/login` — 登录页面
- `#/` — 首页：文档列表 + 搜索
- `#/faq` — FAQ 浏览
- `#/admin/users` — 用户管理（仅 admin）
- `#/admin/logs` — 操作日志（仅 admin）
- `#/admin/faq` — FAQ 管理（仅 admin）

**样式：**
- 现用 Tailwind CSS CDN，保持
- 干净的企业内部工具风格
- 响应式（PC 优先）
- 中文友好字体

**文件列表首页：**
- 按分类 tab 展示（方案 / 报告 / 标准法规参考 / 其他）
- 每项：文件名、分类标签、上传时间、文件格式图标
- 管理员能看到上传按钮（`#/upload` 或 Modal）
- 管理员能看到每项的删除按钮

**搜索页（首页同一页）：**
- 搜索框 + 分类筛选下拉 + 结果列表
- 结果展示：文件名高亮搜索词、分类、上传时间

## Acceptance criteria

- [ ] 导航栏按角色显示不同入口
- [ ] 登录/登出流程流畅
- [ ] 文档列表按分类分 tab
- [ ] 搜索 + 分类筛选联动
- [ ] 管理员能看到上传和删除按钮
- [ ] 普通工程师看不到管理入口和按钮

## Blocked by

#02-auth-system, #05-upload-rework
