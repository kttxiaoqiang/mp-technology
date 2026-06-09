# Issue 1.3: 前端批量管理 UI

## 目标

在知识库文件浏览页面（`/#/`）为管理员添加批量操作模式：
- 文件行/卡片添加 checkbox
- 顶部批量工具栏（全选 + 已选计数 + 批量删除 + 批量分类）
- 参考 FAQ 管理页的交互模式

## 验收标准

1. **管理员可见**：登录为 admin 角色时文件列表显示 checkbox + 工具栏；user 角色无此能力
2. **checkbox 行为**：
   - 每行/卡片左侧 checkbox
   - 勾选后 toolbar 显示已选数量
   - 0 选中时工具栏按钮禁用
3. **全选 checkbox**：工具栏第一个 checkbox，控制当前页所有文件
4. **批量删除**：
   - 点击「删除选中」弹出确认框（数量 + 提示）
   - 确认后调用 `POST /api/files/batch-delete`
   - 成功后刷新列表，显示成功 toast
5. **批量分类**：
   - 点击「移动分类」弹出分类选择下拉
   - 选择分类后调用 `PUT /api/files/batch-category`
   - 成功后刷新列表，显示成功 toast
6. **视觉一致性**：工具栏风格与 FAQ 管理页保持一致

## 技术方案

- 文件：`public/index.html`
- `renderFileList` 函数内适配：
  - 管理员检查：`user.role === 'admin'`
  - 在文件行模板中添加 `<input type="checkbox" data-id="..." class="file-check">`
  - 批量工具栏为 `#batch-toolbar` 元素
- 分类选择器：复用现有分类下拉组件样式
- CSS：checkbox + toolbar 样式（inline-flex, gap, disabled state）

## 测试

- Playwright：admin 登录 → checkbox 和 toolbar 可见
- Playwright：user 登录 → checkbox 和 toolbar 不可见
- Playwright：勾选 2 个文件 → 计数显示 2
- Playwright：全选 checkbox → 所有行勾选
- Playwright：批量删除 → 确认框出现 → 确认 → 文件减少
- Playwright：批量分类 → 选择「报告」→ 确认 → 文件分类更新
