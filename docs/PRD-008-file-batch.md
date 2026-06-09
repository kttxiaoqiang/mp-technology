# PRD-008: 文件批量管理

## Problem Statement

知识库已有 200+ 标准规范文件（GMT 系列），但一张张删除、一个个改分类非常低效。比如当一批标准更新时需要整体迁移分类，或上传了重复文件需要批量清理——目前只能逐个点删除。

已有 FAQ 批量管理功能（PRD-007）可作为交互模式参考。

## Solution

在主文件浏览页面（`/#/`）的卡片/列表视图基础上，添加批量操作模式：

1. **进入批量模式**：顶部出现批量操作工具栏（类似 FAQ 管理页）
2. **批量删除**：多选文件后一次性删除（含对应 .md 文件 + 图片目录）
3. **批量分类**：多选后统一设置分类标签
4. **批量下载**：多选后打包 ZIP 下载
5. **全选/反选**：一键切换

## User Stories

1. As a 管理员, I want to batch-select multiple files via checkboxes, so that I can perform bulk operations instead of editing one by one.
2. As a 管理员, I want to select all visible files on the current page, so that I can apply actions to the whole page quickly.
3. As a 管理员, I want to batch-delete selected files, so that I can clean up outdated documents efficiently.
4. As a 管理员, I want to batch-update the category of selected files, so that I can reorganize document taxonomy in one action.
5. As a 管理员, I want to batch-download selected files as a ZIP archive, so that I can export documents for offline use.

## Implementation Decisions

- **后端新增 3 个端点**：
  - `POST /api/files/batch-delete` — 批量删除（paths 数组）
  - `PUT /api/files/batch-category` — 批量改分类（paths + category）
  - `GET /api/files/batch-download` — 批量下载 ZIP（?paths[]=... 或 POST 返回 ZIP）
- **前端修改**：
  - `renderFileList` 中每行/卡片增加 checkbox（管理员可见）
  - 文件列表顶部新增批量工具栏（全选/计数/删除/分类/下载）
  - 工具栏在无选中时禁用（同 FAQ 模式）
- **批量下载采用流式 ZIP**：用 `archiver` 包流式压缩，避免内存爆炸
- **复用现有 `detectCategory` 和日志钩子**

## Testing Decisions

- **测试原则**：UI 行为用 Playwright 验证（checkbox 可见/可选、工具栏状态切换），后端逻辑用 supertest 或 curl 验证
- **测试模块**：
  - `batch-delete`：文件 + 对应 .md + _images 目录完整删除
  - `batch-category`：分类更新 + 自动移到对应目录
  - `batch-download`：ZIP 包含所选文件
  - UI：Playwright 覆盖按钮存在性、全选/反选、计数更新
- **参考**：`test/faq-batch.test.cjs` 的后端测试模式（spawn server + 临时 DB）

## Out of Scope

- 文件移动/重命名操作
- 跨目录批量操作
- 非管理员使用批量功能
- 批量上传（已有 PRD-006）

## Further Notes

- 交互模式完全参考 `renderAdminFaq` 的批量工具栏（全选 checkbox + 已选计数 + 操作按钮禁用状态）
- 文件系统的 `_images/` 目录也需要一并删除
