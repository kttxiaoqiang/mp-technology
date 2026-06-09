# Issue 1.2: 后端批量分类 API

## 目标

`PUT /api/files/batch-category` — 接收文件 ID 数组 + 目标分类，批量更新分类并物理移动文件

## 验收标准

1. 接收 `{ ids: number[], category: string }` 请求体
2. 校验权限（仅 admin）
3. 分类有效性校验（在白名单中：方案/报告/密评FAQ/标准规范/法规政策/参考文档/其他）
4. 对每个 ID：
   - 查询 DB 获取当前 `storage_path`（如 `密评FAQ/GMT xxx.pdf`）和 `md_path`
   - 计算新路径：旧文件名去掉旧目录前缀，加上新目录
     - 例：`密评FAQ/GMT xxx.pdf` → `标准规范/GMT xxx.pdf`
   - 物理移动文件（`fs.renameSync`）
   - 如果 `md_path` 存在，同步移动
   - 更新 DB 的 `storage_path`、`md_path`、`category` 字段
5. 记录操作日志
6. 返回 `{ updated: number }`
7. 错误处理：某个文件移动失败 → 跳过 + 继续处理其余

## 技术方案

- 分类白名单：与 `convert.cjs` 中的 `CATEGORIES` 一致
- 目录管理：确保目标目录存在（`mkdirSync recursive`）
- `_images` 目录跟随主文件移动

## 测试

- PUT 批量改分类 → 文件物理移到新目录 + DB 更新
- PUT 无效分类 → 400
- PUT 部分失败 → 返回正确的 `updated` 数量
- 非管理员 401
