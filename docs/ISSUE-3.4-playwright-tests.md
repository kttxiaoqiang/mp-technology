# Issue 3.4: Playwright 端到端测试覆盖

## Parent

PRD-003-dashboard-stats-charts.md

## What to build

在现有 Playwright 测试文件基础上追加针对 Issue 3.1–3.3 功能的端到端测试。测试套件位于 `/tmp/kb-web-playwright.cjs`。

### 追加的测试用例（紧接现有测试之后）

**统计区测试**（验证 Issue 3.2）：
1. `#stats-footer` 元素存在
2. `.stat-card` 数量为 4
3. 4 个统计标签文本为：文档总数、分类覆盖、文件格式、总存储
4. `.recent-updates` 存在且 `.ru-item` 数量 > 0
5. `.site-footer` 文本包含 "v1.0"
6. 文档总数 stat-value 等于 `/api/files` 返回的文件数

**图表测试**（验证 Issue 3.3）：
7. `.chart-grid-2x2` 网格元素存在
8. `.chart-box` 数量为 4
9. ECharts 库已加载（`page.evaluate(typeof echarts !== "undefined")`）
10. 4 个 chart-box 均有对应的 ECharts 实例（`echarts.getInstanceByDom`）
11. 柱状图 `getOption().series[0].data.length > 0`

### 测试设计原则
- 不测试 ECharts 渲染像素（这属于 ECharts 自身测试）
- 不 mock API——所有测试端到端使用真实服务器和数据
- 确认数据结构正确，而非 UI 像素对齐
- 使用已存在的测试用户 testadmin/testpass123 登录

## Acceptance criteria

- [ ] 全部 11 个测试在新旧测试套件中均通过
- [ ] 测试文件语法有效（`node -c` 检查）
- [ ] 测试不依赖外部网络
- [ ] 测试在有数据和无数据场景下都能正确报告（热门搜索词为空时显示占位，但测试不因此失败）
- [ ] 测试套件整体 exit code 0

## Blocked by

- Issue 3.3 (图表 DOM 和 ECharts 实例需要先存在才能被测试)
