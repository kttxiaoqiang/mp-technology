## Problem Statement

当前登录页在前几轮改造后加入了粒子动画、浮动几何体、staggered 入场等效果，但存在三个核心问题：

1. **字体对比度不足** — 标题渐变文字、subtitle、slogan、输入框在 dark 深色背景上偏暗，视觉层次弱
2. **粒子特效观感不佳** — 用户反馈"不融洽"，且 JS 驱动的 canvas 粒子有性能开销（200粒子+鼠标跟踪）
3. **HTML 结构不规范** — 标题用 `<div>` 而非 `<h1>`，输入框缺少 `<label>` 关联，表单缺少语义分组

## Solution

以"干净、高级、一眼清晰"为目标，用纯 CSS 替换 JS 粒子特效，全面加深字体对比度，改进 HTML 语义化。

### 核心设计原则
- **零 JS 背景** — 所有背景装饰使用 CSS（渐变/网格/光晕/浮动几何体），关闭 canvas 粒子
- **对比度优先** — 所有文字色在深色背景上保证 WCAG AA 级（≥4.5:1）
- **渐进增强** — 先确保基础可用性，动画装饰不破坏可用性

## User Stories

1. 作为**用户**，打开登录页时能一眼看清标题和输入框，不需要眯眼
2. 作为**用户**，登录页加载时不卡顿、不闪烁，背景装饰不影响操作
3. 作为**开发者**，HTML 结构语义化，便于维护和屏幕阅读器支持

## Implementation Decisions

### Stage 1 — 字体对比度修复（P0）
| 元素 | 当前值 | 目标值 | 原因 |
|------|--------|--------|------|
| `login-title` | 渐变 `#8abdf0→#3b82f6→#7c3aed` | 渐变 `#e0f0ff→#60b0ff→#a080ff` | 整体亮度提高 |
| `login-subtitle` | `#7faad8` | `#b0d4ff` | 对比度 3.5:1→6.1:1 |
| `login-slogan` | `#5cc5ff` | `#90e0ff` | 更明亮 |
| `input color` | `#f0f8ff` | `#ffffff` + `font-weight:500` | 纯白+半粗 |
| `input::placeholder` | `rgba(140,180,220,0.5)` | `rgba(160,200,240,0.7)` | 亮+实 |
| `login-btn` | `#0ef` | `#fff` + 背景亮蓝 | 文字白底深色按钮 |

### Stage 2 — 背景特效替换（P1）
**选型：科技网格（`conic-gradient` + 网格线 + 中心放射渐隐）**

理由（对比各方案）：
| 方案 | 性能 | 视觉 | 维护 | 选中？ |
|------|------|------|------|--------|
| ❌ 粒子 | 中（JS canvas） | 好但用户不喜欢 | 难 | ❌ |
| ✅ 科技网格 | 零（纯CSS） | 高级、不打扰 | 好 | ✅ |
| ❌ 渐变波纹 | 零 | 稍显单调 | 好 | ❌ |
| ❌ 动态波浪 | 零 | 像SaaS模板 | 好 | ❌ |
| ❌ 彩色光斑 | 零 | 太抽象 | 好 | ❌ |
| ❌ 字符雨 | 零 | 赛博朋克过重 | 好 | ❌ |

**技术实现**：
- 删除 `<canvas id="login-particles">` 及 `startLoginParticles()` 方法
- 新增纯 CSS `.login-grid` 元素
- 细网格线（`background-image: linear-gradient(...)`），背景尺寸 40px
- 中心放射渐隐 mask（从中心全黑→边缘全透）
- 保留现有浮动几何体（`.login-geo`）和光晕（`.login-glow`）

### Stage 3 — HTML 语义化（P2）

```html
<!-- 改造模式 -->
<!-- 当前 -->        <!-- 改进 -->
<div>xxx</div>      <h1 class="login-title">密评知识中枢</h1>
<div>xxx</div>      <p class="login-subtitle">...</p>
<!-- input -->       <label for="u" class="sr-only">用户名</label>
                     <input id="u" name="username">
```

- 标题 `<div>` → `<h1>`
- subtitle → `<p>`
- 所有 input 加 `<label>`（视觉隐藏，仅用于可访问性）
- icon 加 `aria-hidden="true"`
- 错误提示加 `role="alert"`
- 页脚加 `<footer>`

### Stage 4 — 响应式适配（P3）
- `<480px`: `login-card` padding 缩小、标题缩小、按钮 letter-spacing 减小

## Testing Decisions

### 行为测试（Playwright）
1. **TC1-对比度**：截图对比 title/subtitle/input 色值，确认符合预期
2. **TC2-无 JS 依赖**：禁用 JS，页面应显示正确——背景纯色渐隐+静态网格，内容可见
3. **TC3-输入框聚焦**：focus 时 input-line 展开、icon 变色
4. **TC4-错误提示**：提交空表单 → error 显示 `role="alert"` 存在
5. **TC5-响应式**：viewport 375px 时卡片不溢出，排版合理

### 测试方式
用 Playwright headed mode 截图对比（不写传统断言，先目测）

## Out of Scope
- 登录页的 light 模式适配（当前只有 dark 主题）
- 自动登录 / "记住我" 功能
- 第三方 OAuth 登录集成
- 登录页背景图片上传自定义

## Open Questions
- 替换粒子后，现有 `.login-geo`（浮动几何体）是否需要保留？
- 热搜词是否需要动态从服务端获取（现在写死在 HTML 里）？
