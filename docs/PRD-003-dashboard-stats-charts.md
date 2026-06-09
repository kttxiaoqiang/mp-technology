# PRD-003: 首页底部统计区与数据可视化图表

## Problem Statement

企业密码应用安全评估知识库首页缺乏数据概览能力。用户登录后只能看到分类卡片列表，无法快速了解库内文档的整体情况（总量、分类分布、文档类型、近期更新）。同时，搜索功能缺少趋势反馈——用户不知道哪些关键词被频繁搜索。整体首页信息密度低，需要滚动阅读才能获得完整认知。

## Solution

在首页分类卡片下方新增统计区 + 4 个 ECharts 数据可视化图表。统计区提供关键 KPI 摘要（文档总数、分类覆盖数、文件格式数、总存储量），图表以柱状图/折线面积图/环形图/横向柱状图呈现更深层的数据分布与趋势。搜索词数据通过后端的搜索日志自动累积，随时间自然丰富。

## User Stories

1. 作为知识库用户，我希望在首页看到文档总数统计，以便快速评估知识库的内容规模
2. 作为知识库用户，我希望看到文档分类覆盖数，以便了解知识库对不同密评领域的覆盖程度
3. 作为知识库用户，我希望看到文件格式分布统计，以便了解知识库包含哪些类型的文档资源
4. 作为知识库用户，我希望看到最近添加到知识库的文档列表，以便快速发现新内容
5. 作为知识库用户，我希望通过柱状图直观看到各分类的文档数量分布，以便定位信息密集的分类领域
6. 作为知识库用户，我希望通过折线面积图看到文档新增的时间趋势，以便了解知识库的更新活跃度
7. 作为知识库用户，我希望通过环形图看到文档类型（PDF/MD/DOCX 等）的占比，以便了解知识库的技术文档构成
8. 作为知识库用户，我希望看到热门搜索词统计（横向柱状图），以便了解其他用户关注哪些密评话题
9. 作为知识库用户，我希望看到版权页脚（版本号和组织信息），以明确知识库版本归属
10. 作为系统管理员，我希望搜索词日志自动记录，以便搜索引擎趋势数据随时间自然累积

## Implementation Decisions

### 模块划分

| 模块 | 类型 | 职责 |
|------|------|------|
| `/api/stats` 端点 | 后端 API | 聚合文件元数据，返回分类/扩展名/月度趋势/热门搜索词 |
| 搜索日志记录器 | 后端中间件 | 在 `/api/search` 中追加查询到 `/tmp/search-log.jsonl` |
| `renderStatsFooter()` | 前端方法 | 渲染统计卡片 + 最近文档 + 网站页脚 |
| `renderCharts()` | 前端方法 | 初始化 4 个 ECharts 实例并绑定数据 |
| ECharts 库 | 前端依赖 | `public/lib/echarts.min.js`，离线内联加载 |

### API 契约

```
GET /api/stats → 200
{
  "categories": { "方案": 6, "报告": 2, ... },
  "extensions": { "PDF": 3, "MD": 8, ... },
  "monthlyTrend": [ { "month": "2026-05", "count": 37 } ],
  "popularSearches": [ { "keyword": "密码", "count": 5 }, ... ]
}
```

### 架构决策

- **纯前端计算分类/扩展名**：`/api/stats` 后端做数据聚合，前端直接消费，零复杂逻辑
- **搜索日志文件**：使用 `/tmp/search-log.jsonl` 简单追加文件，无数据库依赖。搜索词截断到 50 字符
- **ECharts 离线内联**：echarts.min.js (1.1MB) 放 `public/lib/`，通过 `<script>` 标签加载
- **2×2 网格布局**：CSS Grid，毛玻璃卡片包裹每个图表，`scaleIn` 动画按 0s/0.1s/0.2s/0.3s 延迟入场
- **响应式**：在 ≤768px 宽度时切换到单列布局
- **配色主题**：青色系 #0ef → #3b82f6 → #8b5cf6 渐变，坐标轴/标签 #a0e9ff，分割线 rgba(30,58,95,.4)
- **图表容器高度**：200px（桌面端），180px（移动端）

### CSS 架构

- `.stats-section`：统计区容器，上边框分隔
- `.stats-grid`：4 列网格，每个 `.stat-card` 毛玻璃背景
- `.chart-grid-2x2`：2 列网格，每个 `.chart-card` 毛玻璃 + scaleIn 动画
- `.site-footer`：页脚，上边框分隔

## Testing Decisions

### 测试哲学

- 测试外部行为，非实现细节
- 前端测试使用 Playwright 真实浏览器渲染，验证 DOM 存在性和 ECharts 实例化状态
- 后端 API 测试通过 HTTP 请求验证 JSON 响应结构和数据类型

### 测试范围

| 测试 | 层级 | 方法 |
|------|------|------|
| 统计区 DOM 存在性 | 前端集成 | Playwright `.$("#stats-footer")` |
| 4 个统计卡片数量 | 前端集成 | Playwright `.$$(".stat-card")` count === 4 |
| 统计标签文本 | 前端集成 | Playwright `.$$eval` labels |
| 最近文档列表 | 前端集成 | Playwright `.$$(".ru-item")` length > 0 |
| 页脚版权文本 | 前端集成 | Playwright textContent includes "v1.0" |
| 文档总数与 API 匹配 | 端到端 | Playwright 对比 stat-value 与 `/api/files` count |
| 4 个 chart-box DOM 存在 | 前端集成 | Playwright `.$$(".chart-box")` count === 4 |
| ECharts 库加载 | 前端集成 | Playwright `typeof echarts !== "undefined"` |
| 4 个 ECharts 实例化 | 前端集成 | Playwright `echarts.getInstanceByDom` count === 4 |
| 图表数据负载 | 前端集成 | Playwright `getOption().series[0].data` length > 0 |
| `/api/stats` 端点 | 后端集成 | HTTP 请求验证 JSON 结构和字段完备性 |
| 搜索日志记录 | 后端集成 | 执行搜索后验证 `/tmp/search-log.jsonl` 存在且有内容 |

### 测试参考

现有 Playwright 测试文件 `/tmp/kb-web-playwright.cjs` 中使用相同的 Page Object 模式（`page.fill`、`page.click`、`page.evaluate`）。

## Out of Scope

- 中文文本分词优化（搜索日志使用原始输入的小写截断版本）
- ECharts 深色主题（使用青色系配色而非内置 dark theme）
- 交互式图表下钻（点击图表跳转到对应分类/搜索）
- 统计区导出功能
- 自定义统计时间范围
- 图表动画精细化（采用 ECharts 内置 animation 而非自定义）

## Further Notes

- 搜索日志需要用户真实搜索行为才会产生数据。初始上线时热门搜索词图表显示"暂无搜索数据"占位文本
- 所有文件都使用 fs.statSync 的 mtime 作为创建时间，因此所有已存在文件的 mtime 统一为上传时间
- ECharts 6.1.0 的 graphic 访问路径为 `graphic[0].elements[0].style.text`（非 `graphic[0].style.text`）
