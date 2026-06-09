# Issue 2.3: 滚动条美化（细条发光）

## 描述

定制滚动条为 5px 细条，hover 时产生微弱发光效果（`box-shadow` 带 primary 色）。

## 验收标准

- [ ] `::-webkit-scrollbar` 宽度 5px
- [ ] `::-webkit-scrollbar-track` 背景透明
- [ ] `::-webkit-scrollbar-thumb` 默认 #CBD5E1
- [ ] `::-webkit-scrollbar-thumb:hover` 背景 #94A3B8 + `box-shadow: 0 0 8px rgba(37,99,235,.3)`
- [ ] 滚动条在非 hover 状态下不发光（保持低调）

## 文件

`/home/zhang/kb-web/public/index.html` — CSS `<style>` 区块

## 工作量

约 5 分钟
