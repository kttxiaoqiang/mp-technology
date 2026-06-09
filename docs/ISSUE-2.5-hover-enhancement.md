# Issue 2.5: Hover 强化（图标放大 + 边框发光）

## 描述

卡片 hover 时，图标放大 1.1x，卡片边框产生微弱的蓝色发光。

## 验收标准

- [ ] `.category-card:hover .cat-icon` 有 `transform: scale(1.15)` + `transition`
- [ ] `.file-card:hover .file-icon` 有 `transform: scale(1.15)` + `transition`
- [ ] `.category-card:hover` 有 `box-shadow: 0 0 0 1px var(--primary-border), var(--shadow-md)`
- [ ] `.file-card:hover` 有同样的边框发光效果
- [ ] `transition` 时长 200ms

## 文件

`/home/zhang/kb-web/public/index.html` — CSS `<style>` 区块

## 工作量

约 15 分钟
