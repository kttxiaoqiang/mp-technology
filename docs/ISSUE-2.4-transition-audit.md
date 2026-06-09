# Issue 2.4: 交互过渡全面审计

## 描述

确保界面中所有可交互元素都有 `transition` 过渡，消除"生硬跳变"。

## 验收标准

- [ ] `.badge` 有 `transition`（颜色/背景变化时）
- [ ] `.search-result-item` 确保 hover 有过渡（已有，双检）
- [ ] `.file-row` hover 背景变化有过渡（已有，双检）
- [ ] `.load-more-btn` hover 变化有过渡（已有，双检）
- [ ] 所有 `tr:hover td` 背景变化有过渡
- [ ] `select` 焦点边框变化有过渡
- [ ] `.modal-overlay` 有 `transition: opacity`（已有 animation，改成 opacity transition + 显示/隐藏控制）
- [ ] 登录页 `.login-card` 有 `transition: box-shadow, transform`

## 文件

`/home/zhang/kb-web/public/index.html` — CSS `<style>` 区块

## 工作量

约 20 分钟
