## Parent

`docs/PRD-007-faq-extract-batch.md` — FAQ 智能抽取 + 批量管理

## What to build

Frontend UI updates for FAQ bulk management and AI extraction, all within the existing `public/index.html` single-page app.

This slice covers:

### FAQ 管理页面 (`renderAdminFaq`) 新增：

1. **顶部操作栏**：
   - 分类下拉筛选器（调用 `GET /api/faq/categories` 获取选项）
   - 全选复选框
   - 批量删除按钮（选中后出现，确认弹窗）
   - 批量修改分类下拉（选中后出现）
   - 导入按钮（弹出文件选择器，接受 .csv / .json）
   - 导出按钮（下拉选格式：CSV / JSON，可选分类过滤）
   - 「AI 抽取 FAQ」按钮（见下方）

2. **列表行**：每行新增复选框、来源文件（可点击链接）、抽取标识（🤖 标记）

3. **AI 抽取面板**（点击「AI 抽取 FAQ」弹出模态框）：
   - 文件选择区域（从 `/api/files` 加载，仅显示分类为 标准规范/密评FAQ 的 .md 文件，多项选择含全选）
   - API Key 输入框（密码类型显示）
   - 最大抽取对数输入（默认 50）
   - 开始抽取按钮
   - 结果预览区域（表格显示 question / answer / category，每行有 checkbox）
   - 底部「确认导入所选」按钮（调用批量创建 API）

### FAQ 浏览页面 (`renderFaq`) 新增：

4. **分类标签栏**：从 `/api/faq/categories` 加载，点击筛选
5. **来源链接**：`showSource` 列，有 source_file 时显示为链接，点击跳转到文件预览

## Acceptance criteria

- [ ] 管理页面顶部操作栏含全选、批量删除、批量分类、导入、导出、AI 抽取按钮
- [ ] 全选 checkbox 正确切换所有行选中状态
- [ ] 选中后批量删除弹出确认，删除后列表刷新
- [ ] 批量修改分类后列表刷新显示新分类
- [ ] 导入 CSV/JSON 文件后列表自动刷新并显示新条目数
- [ ] 导出的 CSV/JSON 内容正确
- [ ] AI 抽取面板能加载文件列表、接受 API Key、抽取并预览结果
- [ ] 浏览页面显示分类标签栏，点击筛选
- [ ] 有来源文件的 FAQ 显示可点击链接

## Blocked by

- `docs/ISSUE-7.2-faq-batch-api.md` (needs backend endpoints)
