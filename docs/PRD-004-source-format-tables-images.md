# PRD-004：源格式显示 / 表格保留 / Word 图片提取

> 三个关联的文档体验增强需求；由 `/grill-me` → PRD 流程产生。

---

## 需求 1：卡片显示源文件格式后缀

### 现状
- 知识库将大部分文件（.docx, .pdf, .xlsx 等）转为 .md 存储
- `/api/files` 返回的文件结构中，`api/files` 只返回 `name`/`category`（无 `original_name`）
- 分类卡片顶部 badage 显示 "N 个文档"，没有指示源文件类型的视觉元素
- 搜索结果和文件列表中虽然能显示 `original_name`，但分类卡片只统计计数

#### `GET /api/files` 当前返回
```json
[
  { "name": "密码应用方案.md", "category": "方案" },
  { "name": "密码应用方案.docx.md", "category": "方案" }
]
```
缺少 `original_ext` / `original_name` 字段。

### 目标
1. `/api/files` 增加 `original_ext`（大写扩展名，如 `.DOCX`, `.PDF`）和 `original_name` 字段
2. 分类卡片上，badage 从 `"N 个文档"` → `"N 个文档 · PDF/DOCX/TXT"`（列出该分类中出现的源文件格式，去重）
3. 如果全是 .md（原始就是 markdown 的），显示 `"N 个文档 · MD"`

### 非目标
- 不改文件图标（目前没有格式图标，留待后续）
- 不改搜索结果/文件列表的显示（已经用 original_name）

---

## 需求 2：文档转换保留表格结构

### 现状
- `convert_markitdown.py` 对非 PDF 文件统一调用 `LibreOffice --convert-to txt:Text`
- LibreOffice 的 txt 导出将表格渲染为文本（每行连续文本），丢失表格结构
- 最终 .md 文件里表格变成了无分隔的纯文本，不可读

### 目标
1. 对 .docx 文件，使用 `python-docx` 提取表格
2. 将表格转换为 **Markdown 表格语法**：
   ```markdown
   | 列1 | 列2 | 列3 |
   |-----|-----|-----|
   | 值A | 值B | 值C |
   ```
3. 转换后的 .md 内容包含：YAML 元数据头 + 表格文本 + 其他文本内容
4. 不影响 pdf / xlsx 等格式（这些留待后续或使用 LibreOffice `--convert-to xhtml` 变通方案）

### 实现思路
- 新增转换脚本 `lib/convert_docx.py`，用 `python-docx` 库
- 策略：遍历文档的段落和表格，按文档顺序输出
  - 段落 → 普通文本
  - 表格 → Markdown 表格
  - 图片 → 留占位 `![图片名称](images/filename_media_N.ext)`（关联需求 3）
- `convert_markitdown.py` 增加对 .docx 的分支判断，调用新脚本

### 风险
- docx 文件中段落和表格的序关系复杂（表格内嵌段落、嵌套表格）
- 需要保留段落样式（标题 → `##` 等）——当前 LibreOffice 方式已经丢失标题，新方式应尽量保留
- 合并单元格在 markdown 表格中不支持 → 用 `*合并内容*` 标记

---

## 需求 3：提取 Word 图片供查看

### 现状
- 目前 docx 转换完全丢弃了图片
- 生成的 .md 文件无图片引用
- 前端无图片查看功能

### 目标
1. 处理 .docx 时，解压 `word/media/` 目录中的图片
2. 图片保存到知识库对应位置的 `_images/` 子目录（如 `方案/_images/密码应用方案_media_1.png`）
3. .md 文件中插入 Markdown 图片引用：`![图片](_images/xxx.png)`
4. 前端：在文件详情/预览页显示图片（ECharts 已经用上了，但这里是纯 Markdown 渲染）

### 实现思路
- `python-docx` 遍历 `inline_shapes` / `relationships` 获取图片
- 或直接 `zipfile` 解压 `word/media/*` → 保存到 `{dir}/_images/{stem}_{basename}`
- 图片命名规则：`{源文件无扩展名}_{zip中的文件名}` e.g. `密码应用方案_image1.png`
- .md 中替换图片引用：`![{alt-text}](_images/{filename})`

### 预览方案（前端）
- **方案 A（推荐）**：在搜索结果/文件列表中，docx 文件显示 "含 N 张图片" 标签
- **方案 B**：在文档详情页底部增加「附件图片」区域，用缩略图网格渲染
- **方案 C**：Markdown 渲染时自动显示图片（由 marked/render 处理 `![](...)`）
- 优先实现方案 A（最小可行）+ 方案 C（markdown 天然支持）

### 非目标
- 不在当前版本做图片放大灯箱、画廊等交互

---

## 架构影响总结

| 组件 | 需改 | 说明 |
|------|------|------|
| `server.cjs` `GET /api/files` | ✅ | 增加 `original_ext`、`original_name` 字段 |
| `server.cjs` 上传处理 | ✅ | `/api/upload` 保存 original_ext |
| `lib/convert.cjs` | ✅ | 调整 `toMarkdown()` / `autoConvertToMd()` 分支 |
| `lib/convert_markitdown.py` | ✅ | 增加 docx 专用处理（表格+图片） |
| `lib/convert_docx.py` | **新建** | 核心脚本：python-docx 提取表格+图片 |
| `public/index.html` 分类卡片 | ✅ | badage 增加格式标签 |
| `public/index.html` 文件列表 | ✅ | (可选) 显示图片计数 |
| 知识库 `_images/` 目录 | **新建** | 存放提取的图片 |

## 优先级排序

**P0**（需求 1：格式后缀）— 前端小改动，快速交付
**P0**（需求 3：图片提取）— 后端需要先做，因为影响 .md 生成
**P1**（需求 2：表格保留）— 依赖需求 3 的 docx 处理 pipeline

## 工作量估计

| 需求 | 后端 | 前端 | 测试 |
|------|------|------|------|
| 1. 格式后缀 | 1h (api/files 扩展) | 1h (卡片渲染) | 0.5h |
| 2. 表格保留 | 3h (Python 脚本) | — | 1.5h |
| 3. 图片提取 | 3h (Python 脚本 + 保存) | 0.5h (前端显示) | 1h |
| **合计** | **7h** | **1.5h** | **3h** |
