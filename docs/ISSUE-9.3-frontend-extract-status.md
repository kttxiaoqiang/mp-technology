# ISSUE-9.3: 前端自动抽取状态展示

## 关联 PRD
PRD-009 — 上传自动抽取 FAQ

## 目标
在前端页面中展示自动 FAQ 抽取的状态，包括文件详情页的抽取信息、FAQ 管理页的自动抽取日志标签。

## 改动范围

### public/index.html

#### 1. 文件列表/详情 → 抽取状态标签

在文件列表的每行中（或预览弹窗），如果文件是 `.md` 且非「方案」「报告」，显示抽取状态标签：
- 已抽取 N 条 ✅ → 绿色标签
- 未抽取 → 灰色标签「待抽取」
- 失败 → 红色标签「抽取失败」

**实现**：在文件行渲染中，调用 `GET /api/faq/auto-extract-status?file=...`（懒加载，不阻塞列表渲染）。

#### 2. FAQ 管理页 → 抽取日志标签

在 `renderAdminFaq` 中新增一个标签页（或独立区域）「抽取日志」：

- 显示 `GET /api/faq/auto-extract-log` 返回的日志列表
- 表格格式：时间 | 文件名 | 抽取条目数 | 状态（成功/失败）
- 分页（每页 20 条）

#### 3. 上传成功后的 Toast

文件上传成功时，如果 `response.extraction_status === "pending"`：
- 显示 Toast：「文件上传成功，后台正在自动抽取 FAQ…」
- 如果 `extraction_status === "skipped"`：不提示抽取相关消息

### 详细设计

**文件行抽取状态标签**：

```js
// 在文件列表渲染时，对每个 .md 文件异步获取状态
async function showExtractStatus(el, filePath) {
  try {
    const res = await fetch('/api/faq/auto-extract-status?file=' + encodeURIComponent(filePath));
    const d = await res.json();
    if (d.extracted) {
      el.innerHTML = `<span class="badge badge-success">✅ ${d.count}条</span>`;
    } else {
      el.innerHTML = `<span class="badge badge-muted">待抽取</span>`;
    }
  } catch {
    el.innerHTML = `<span class="badge badge-error">⚠️</span>`;
  }
}
```

**FAQ 管理页的抽取日志标签**：

在 `renderAdminFaq` 侧边导航加「抽取日志」（仅在 admin 可见）。内容区域渲染为日志表格。

**注意**：懒加载状态标签应在文件列表渲染完成后异步执行，不拖慢首次列表加载。
