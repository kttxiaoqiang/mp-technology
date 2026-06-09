# Issue 2.6: 按钮 Ripple 水波纹效果

## 描述

所有 `.btn`（含 `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`）点击时产生水波纹扩散动画。

## 验收标准

- [ ] 点击按钮时，从鼠标点击位置产生一个圆形水波纹
- [ ] 水波纹使用 `::after` 伪元素 + CSS animation 实现
- [ ] 水波纹颜色：按钮文字颜色 20% 透明度
- [ ] 水波纹 400ms 内从 `scale(0)` 到 `scale(4)` + 透明度消失
- [ ] 水波纹不溢出按钮边界（`overflow: hidden`）
- [ ] 快速多次点击不会产生异常行为
- [ ] 不需要 JS 事件监听，纯 CSS 实现（或最小 JS）

## 方案选择

**推荐纯 CSS 实现**：利用 `::after` + `animation` + `@keyframes ripple`，通过 `:active` 触发。
如果纯 CSS 实现有局限（如无法控制点击位置），退而使用 JS 动态创建 `.ripple` 元素。

## 文件

`/home/zhang/kb-web/public/index.html` — CSS `<style>` + JS

## 工作量

约 30 分钟（纯 CSS）或 45 分钟（JS 实现）
