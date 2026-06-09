# Issue 4.1：卡片显示源文件格式标签

> PRD-004 需求 1 | 工作量：后端 1h + 前端 1h + 测试 0.5h

## 验收条件 (ACs)

### AC-1: `/api/files` 返回 `original_ext` 字段
- `GET /api/files` 的每个条目包含 `original_ext`（如 `.DOCX`, `.PDF`, `.TXT`, `.MD`）
- `.md` 文件的 `original_ext` = `.MD`
- 上传时新加文件的 `original_ext` 正确
- 不影响已有条目（向后兼容）

### AC-2: 文件 icon selector 使用 `original_ext`
- 当前文件 icon 用文件扩展名决定：如 `.pdf`→PDF 图标
- 改为用 `original_ext` 判断，确保上传的 docx→md 对应用 .DOCX 图标

### AC-3: 分类卡片显示格式标签
- 卡片 badage 变为 `"N 个文档 · PDF"` 格式
- 该分类下多种格式用 `/` 分隔：`"6 个文档 · DOCX/PDF/TXT"`
- 格式去重 + 排序（按出现次数？字母序？按重要性 PDF > DOCX > XLSX > MD > TXT）
- 所有文件都无格式（全部 .md）时：`"N 个文档 · MD"`

### AC-4: Card counts correct
- 格式标签数量与实际文件匹配
- 无格式项（空 `original_ext`）不显示
- 边界情况：分类有 0 文件时 `"0 个文档"`

## 实现方案

### 后端 `server.cjs`

```js
// GET /api/files 中
// getOriginalExt() 已存在，需要确保返回正确
const cached = scanFiles(KB_PATH);
return cached.map(f => ({
  name: f.name,
  category: f.category,
  original_ext: getOriginalExt(f.name, f.fullPath) // 已实现
}));
```

当前要确认 `getOriginalExt` 逻辑，若已实现则直接利用。

### 前端 `public/index.html`

```js
// 计算格式去重
const formats = new Set();
for (const f of all) {
  if (f.original_ext) formats.add(f.original_ext);
}
const fmtStr = [...formats].sort(EXT_SORT_ORDER).join('/');

// 渲染 badge
`<span class="badge">${s.count} 个文档${fmtStr ? ' · ' + this.esc(fmtStr) : ''}</span>`
```

排序顺序：`PDF` > `DOCX` > `XLSX` > `PPTX` > `DOC` > `XLS` > `PPT` > `MD` > `TXT` > `CSV` > `HTML` > 其他按字母序
