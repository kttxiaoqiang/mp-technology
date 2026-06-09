# Issue 3.2: 首页统计区 UI（KPI 卡片 + 最近文档 + 页脚）

## Parent

PRD-003-dashboard-stats-charts.md

## What to build

在首页分类卡片下方追加统计区。具体渲染位置在 `renderHome()` 中 `renderCategoryCards()` 完成后调用 `renderStatsFooter(all, cats)`。

### 包含三个组件：

**1. 四指标统计卡片行**（.stats-grid / 4× stat-card）：
- 文档总数（从 API 文件列表长度计算）
- 分类覆盖数（从分类列表长度计算）
- 文件格式数（从文件拓展名 Set 计算）
- 总存储量（当前 API 不返回 size 信息，显示 `—` 占位）

每个卡片包含一个 SVG 图标、数值和中文标签。

**2. 最近文档列表**（.recent-updates）：
- 取文件列表前 5 条
- 灰底标签式展示文件名
- 空列表时显示"暂无文档"斜体字样

**3. 网站页脚**（.site-footer）：
- 版权声明 + 版本号 v1.0 + 组织描述
- 用 `JetBrains Mono` 字体渲染版本号

### 数据来源
- 不调用额外 API，全部从 `renderHome()` 中已有的 `all` 参数和 `cats` 参数计算
- 文档总数 = `all.length`
- 最近文档 = `all.slice(0, 5)`

### CSS
- 统计区和页脚样式在 `<style>` 标签内，使用现有 CSS 变量（`--border`, `--radius-md`, `--text-primary` 等）
- 毛玻璃背景（`backdrop-filter: blur(8px)`）
- hover 时边框变为主色

## Acceptance criteria

- [ ] 登录后首页底部显示统计区
- [ ] 4 个 stat-card 正确显示数值（文档数、分类数、格式数、存储占位符）
- [ ] 最近文档列表显示最多 5 条文件名
- [ ] 当文件列表为空时，最近文档列表显示"暂无文档"
- [ ] 页脚显示 "v1.0" 版本号和"企业密评合规管理平台"描述
- [ ] 统计区和分类卡片之间有视觉分隔（上边框或间距）
- [ ] 统计区在侧边栏导航切换后（切换到其他路由再切回首页）仍然正确渲染
- [ ] 所有 SVG 图标正确渲染（4 个统计图标）

## Blocked by

- Issue 3.1 (统计数据本身依赖 `/api/files` 已有数据，但统计区 UI 可独立验证)
