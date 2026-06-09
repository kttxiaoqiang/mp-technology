## Parent

PRD-006: 批量上传目录 (`docs/PRD-006-batch-upload.md`)

## What to build

批量上传功能的完整测试套件。使用 Node.js `node:test` 框架，通过 HTTP 请求验证 `POST /api/upload-batch` 的所有行为。

垂直切片：覆盖 API 全路径的 6 项测试用例。使用独立的服务实例（独立端口/知识库目录/数据库），端到端验证。

## Acceptance criteria

- [ ] **Test 1** — 上传 4 个文件（含子目录），全部成功，分类正确：
      - 密码应用方案书.txt → 方案
      - 评估报告.md → 报告
      - 密评FAQ.md → 密评FAQ
      - readme.txt → 其他
- [ ] **Test 2** — 重复上传同一目录，自动加 `_1`/`_2` 序号，无同名冲突
- [ ] **Test 3** — 不存在的目录返回 400 错误
- [ ] **Test 4** — 空目录返回 `count: 0, successCount: 0`
- [ ] **Test 5** — 普通文件路径（非目录）返回 400 错误
- [ ] **Test 6** — 缺省 dirPath 参数返回 400 错误
- [ ] 每个测试独立运行，测试间不共享状态
- [ ] 测试清理：after 钩子删除临时知识库目录和测试源目录，终止服务进程

## Blocked by

ISSUE-6.1-batch-api

测试只能在 API 端点就绪后运行。
