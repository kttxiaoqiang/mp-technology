# Issue 3.3: 2×2 数据可视化图表网格

## Parent

PRD-003-dashboard-stats-charts.md

## What to build

在统计区下方添加 2×2 网格布局的 4 个 ECharts 图表。调用入口在 `renderStatsFooter()` 末尾——先渲染 DOM，然后 `setTimeout(() => this.renderCharts(), 150)` 给 ECharts 留出 DOM 初始化时间。`renderCharts()` 内部请求 `/api/stats`，数据到达后初始化 4 个独立 ECharts 实例。

### 图表容器

每个图表被包裹在一个 `.chart-card` 毛玻璃卡片中，包含标题和 `.chart-box` 容器。使用 CSS Grid `grid-template-columns: 1fr 1fr` 实现 2 列布局，≤768px 时切换为单列。

### 四个图表

**1. 各分类文档数量**（柱状图）
- ECharts `type: 'bar'`
- 青色线性渐变：`#0ef`（顶）→ `#3b82f6`（底）
- 圆角顶端 `borderRadius: [6,6,0,0]`
- **数据源**：`/api/stats`→`categories`

**2. 本月新增趋势**（折线面积图）
- ECharts `type: 'line'` 平滑曲线 + `areaStyle` 渐变填充
- 圆形标记点 `symbolSize: 8`，#0ef 发光边缘
- 渐变区域从 rgba(0,238,255,0.35) 到 rgba(0,238,255,0.02)
- **数据源**：`/api/stats`→`monthlyTrend`

**3. 文档类型占比**（环形图）
- ECharts `type: 'pie'`，半径 50%-72%
- 中心显示总计数字（通过 `graphic` 配置）
- 配色从 9 色青色系调色板循环取色
- **数据源**：`/api/stats`→`extensions`

**4. 热门搜索词**（横向柱状图）
- ECharts `type: 'bar'` 横向（x 轴数值 / y 轴分类）
- 紫色到青色渐变：`#8b5cf6`（底）→ `#0ef`（顶）
- 圆角右端 `borderRadius: [0,6,6,0]`
- 无搜索记录时显示"暂无搜索数据"占位条
- **数据源**：`/api/stats`→`popularSearches`

### 入场动画
- 卡片容器使用 CSS `scaleIn` 动画，延迟 0s / 0.1s / 0.2s / 0.3s
- ECharts 系列各自的 `animationDelay`：柱状图 80ms/项递进，折线图 200ms，环形图 400ms，横向柱状图 100ms/项 + 600ms 偏移

### 页面融合
- 图表背景透明（ECharts 无背景色配置，CSS 卡片背景为毛玻璃效果代理）
- 所有坐标轴、标签使用 `#a0e9ff`
- 分割线 `rgba(30,58,95,0.4)` 虚线

### 响应式
- `window.addEventListener('resize', ...)` 统一更新 4 个实例
- `echarts.init()` 采用默认自动适配

## Acceptance criteria

- [ ] 统计区下方出现 2×2 图表网格
- [ ] 4 个 chart-box DOM 元素存在
- [ ] ECharts 库已加载（`typeof echarts !== "undefined"`）
- [ ] 4 个 ECharts 实例已初始化（`echarts.getInstanceByDom` 返回 4 个实例）
- [ ] 柱状图数据与 `/api/stats`→`categories` 内容匹配
- [ ] 折线图趋势数据与 `/api/stats`→`monthlyTrend` 内容匹配
- [ ] 环形图数据与 `/api/stats`→`extensions` 内容匹配
- [ ] 横向柱状图数据与 `/api/stats`→`popularSearches` 内容匹配
- [ ] 无搜索日志时显示"暂无搜索数据"
- [ ] 卡片入场动画生效（scaleIn + 延迟偏移）
- [ ] 浏览器 resize 时所有图表自适应
- [ ] 窄屏（≤768px）时切换到单列布局

## Blocked by

- Issue 3.1 (数据源依赖 `/api/stats` 端点)
- Issue 3.2 (图表容器渲染在统计区 DOM 之后)
