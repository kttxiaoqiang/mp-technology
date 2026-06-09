# Issue 2.1: 点击按压反馈（:active scale）

## 描述

所有可点击元素（卡片、按钮、标签页、FAQ 项）在按下时添加 `transform: scale(0.97)` 微压缩反馈，释放后恢复。

## 验收标准

- [ ] 所有 `.btn` 在 `:active` 时 `scale(0.97)`，`transition` 100ms
- [ ] `.category-card` 在 `:active` 时 `scale(0.97)`
- [ ] `.file-card` 在 `:active` 时 `scale(0.97)`
- [ ] `.faq-q` 在 `:active` 时 `scale(0.98)`
- [ ] `.tab` 在 `:active` 时 `scale(0.97)`
- [ ] `transform` 动效不引起布局重排

## 文件

`/home/zhang/kb-web/public/index.html` — CSS `<style>` 区块

## 工作量

约 15 分钟
