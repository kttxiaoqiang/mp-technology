# ISSUE-9.4: 自动 FAQ 抽取集成测试

## 关联 PRD
PRD-009 — 上传自动 FAQ 抽取

## 目标
编写后端集成测试，验证：
1. 非「方案/报告」文件上传 → 触发后台抽取
2. 方案/报告文件上传 → 跳过抽取
3. FAQ 写入 `faq` 表正确
4. 重复上传同一文件 → 旧抽取记录被清空

## 测试设计

### 测试文件

`test/auto-faq-extract.test.cjs`

### 测试策略

- 启动独立 Express 服务器（测试模式），使用独立 SQLite 数据库
- Mock DeepSeek API 调用（拦截 `fetch` 到 `api.deepseek.com`）
- 上传不同类型的文件，验证 `extraction_status` 和 FAQ 表内容

### Mock 策略

使用 `nock` 或覆写 `global.fetch` 拦截 DeepSeek API 请求，返回固定 JSON 响应：

```js
const mockFAQResponse = JSON.stringify([
  {
    question: "测试问题1",
    answer: "测试答案1",
    category: "基础概念",
    source_section: "第3章"
  },
  {
    question: "测试问题2",
    answer: "测试答案2",
    category: "合规要求",
    source_section: "第5章"
  }
]);
```

### 测试用例

1. **上传非方案/报告文件 → 触发抽取**
   - 上传一个 `标准规范` 类文件
   - 断言 `extraction_status === "pending"`
   - 等待异步任务完成（setTimeout 或轮询）
   - 查询 `faq` 表，断言有 2 条记录

2. **上传方案文件 → 跳过抽取**
   - 上传一个分类为 `方案` 的文件
   - 断言 `extraction_status === "skipped"`
   - 查询 `faq` 表，无新增记录

3. **上传报告文件 → 跳过抽取**
   - 同 2，上传分类为 `报告` 的文件

4. **重复上传 → 旧记录被清空**
   - 上传文件 A → 抽取 2 条
   - 再次上传文件 A（mock 返回 3 条） → 断言旧 2 条被删除，新 3 条存在

5. **API 调用失败 → 记录错误日志**
   - Mock API 返回 500
   - 上传文件 → 检查 logs 表有 `faq_auto_extract` action，detail 包含失败信息

6. **空结果 → 不写入 FAQ**
   - Mock 返回 `[]`
   - 上传文件 → faq 表无新增记录
