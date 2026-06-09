# Issue 2.2: 卡片入场动画（staggered fade-in）

## 描述

页面加载/分类切换时，所有卡片（分类卡片、文件卡片、搜索结果列表）按顺序依次淡入，间隔 50ms，营造高级感。

## 验收标准

- [ ] 分类卡片入场：每张卡片间隔 50ms 延迟，`opacity: 0 → 1` + `translateY(8px → 0)`
- [ ] 文件卡片入场：同分类卡片，间隔 50ms
- [ ] 搜索结果列表项入场：同样 staggered 效果
- [ ] 切换分类时重新触发入场动画
- [ ] JS 方法：`this.animateStaggered(container, '.category-card', 50)` 可复用
- [ ] CSS class：`.anim-stagger { opacity: 0; transform: translateY(8px); transition: all 0.35s cubic-bezier(0.3,0,0.4,1); }`
- [ ] 入场完成后 class 清除以释放 GPU 内存

## 文件

`/home/zhang/kb-web/public/index.html` — CSS `<style>` + JS

## 工作量

约 45 分钟
