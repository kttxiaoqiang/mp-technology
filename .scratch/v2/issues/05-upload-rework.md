Status: ready
Parent: PRD.md
Blocked by: #01-database-init

## What to build

文档上传逻辑重构。

**分类调整**：从代码里的硬编码关键词改为 4 类文档主分类（方案/报告/标准法规参考/其他）。原有的 "密评FAQ" 移除（独立 FAQ 模块见后续 issue）。

**分类映射：**
- 方案 → 方案、计划、设计
- 报告 → 报告、评估报告、测评报告
- 标准法规参考 → 标准、规范、法规、政策、指导、指南、GB/T、国标、参考文献
- 其他 → 默认

**上传流程改造：**
1. 上传文件 → 保存到知识库目录（`company_knowledge_base/`）
2. 调用 MarkItDown 转换 → 生成 `.md` 到 `kb_data/md_cache/`（按文件 hash 命名）
3. 自动分类 → 写入 `files` 表
4. 操作写入日志（action: 'upload'）
5. 返回文件 ID 和分类结果

**API：**
- `POST /api/upload` — 仅 admin，接收 multipart file
- `DELETE /api/files/:id` — 仅 admin，删除文件 + md 缓存 + 日志

**注意事项：**
- 中文文件名 latin1→utf8 转码（复用现有多
- 保留原有上传处理的容错逻辑

## Acceptance criteria

- [ ] 上传文件自动分类为 4 类之一
- [ ] 分类标签落到现有 "密评FAQ" 的文档分到"其他"
- [ ] md 缓存文件不覆盖（基于 hash）
- [ ] 删除文档同时清理 md 缓存和数据库记录
- [ ] 删除操作写入日志
- [ ] 上传操作写入日志

## Blocked by

#01-database-init
