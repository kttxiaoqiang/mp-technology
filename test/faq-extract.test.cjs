/**
 * lib/faq_extract.cjs 单元测试
 *
 * 测试公开接口 extractFaqs / extractFaqsFromFiles 的行为。
 * 网络层 mock fetch，其余用真实代码。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── mock fetch ──
const originalFetch = globalThis.fetch;
let mockResponses = [];
let fetchCalls = [];

function setupMock() {
  fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    const entry = mockResponses.shift();
    if (!entry) throw new Error('Unexpected fetch call (no mock set)');
    if (entry.error) throw entry.error;
    return {
      ok: entry.ok !== false,
      status: entry.status || 200,
      json: async () => entry.json !== undefined ? entry.json : { choices: [{ message: { content: JSON.stringify([]) } }] }
    };
  };
}

function resetMock() {
  globalThis.fetch = originalFetch;
  mockResponses = [];
  fetchCalls = [];
}

// ── sample standard text (abridged) ──
const SAMPLE_STANDARD_TEXT = `# GM/T 0054-2018 信息系统密码应用基本要求

## 1 范围
本标准规定了信息系统密码应用的基本要求。

## 5 基本要求

### 5.1 物理和环境安全
密码技术为信息系统物理环境提供身份鉴别、数据完整性和保密性保护。

### 5.2 网络和通信安全
密码技术为网络通信提供身份鉴别、数据完整性和保密性保护。

## 7 密钥管理

### 7.1 密钥生命周期
密钥管理应覆盖密钥的产生、存储、分发、使用、更新、撤销和销毁等全生命周期。`;

const LLM_RESPONSE_JSON = JSON.stringify([
  { question: '密码应用安全性评估的基本要求有哪些？', answer: '根据 GM/T 0054-2018 第5章，基本要求包括...', category: '合规要求', source_section: '5 基本要求' },
  { question: '物理和环境安全对密码应用有什么要求？', answer: '密码技术为信息系统物理环境提供身份鉴别...', category: '合规要求', source_section: '5.1 物理和环境安全' },
  { question: '密钥管理应覆盖哪些生命周期环节？', answer: '密钥管理应覆盖密钥的产生、存储、分发...', category: '密钥管理', source_section: '7.1 密钥生命周期' },
]);

// ── tests ──
describe('lib/faq_extract.cjs', () => {
  let extract;

  before(async () => {
    setupMock();
    extract = require('../lib/faq_extract.cjs');
    resetMock();
  });

  describe('extractFaqs(text)', () => {
    it('returns structured FAQ array from valid LLM response', async () => {
      setupMock();
      mockResponses.push({
        json: { choices: [{ message: { content: LLM_RESPONSE_JSON } }] }
      });

      const result = await extract.extractFaqs(SAMPLE_STANDARD_TEXT, { apiKey: 'sk-test' });
      assert.equal(result.length, 3, `应返回3个条目: ${JSON.stringify(result)}`);
      assert.equal(result[0].question, '密码应用安全性评估的基本要求有哪些？');
      assert.equal(result[0].category, '合规要求');
      assert.ok(result[0].source_section, '应有来源章节');
      assert.ok(result[0].answer, '应有答案');

      // verify api key is sent
      const call = fetchCalls[0];
      assert.ok(call.opts.headers['Authorization'], '应含 Authorization header');
      resetMock();
    });

    it('empty text returns empty array', async () => {
      setupMock();
      // Should not call API for empty input
      const result = await extract.extractFaqs('', { apiKey: 'sk-test' });
      assert.equal(result.length, 0);
      assert.equal(fetchCalls.length, 0, '空文本不应调用 API');
      resetMock();
    });

    it('missing apiKey returns rejected promise', async () => {
      setupMock();
      await assert.rejects(
        () => extract.extractFaqs(SAMPLE_STANDARD_TEXT, {}),
        { message: /API key/ },
        '缺失 API Key 应拒绝'
      );
      assert.equal(fetchCalls.length, 0, '缺失 API Key 不应调用 API');
      resetMock();
    });

    it('maxPairs limits returned results', async () => {
      setupMock();
      mockResponses.push({
        json: { choices: [{ message: { content: LLM_RESPONSE_JSON } }] }
      });

      const result = await extract.extractFaqs(SAMPLE_STANDARD_TEXT, { apiKey: 'sk-test', maxPairs: 2 });
      assert.equal(result.length, 2, `maxPairs=2 应只返回2条: ${JSON.stringify(result)}`);
      resetMock();
    });

    it('API HTTP error returns rejected promise with error details', async () => {
      setupMock();
      mockResponses.push({
        ok: false,
        status: 401,
        json: { error: { message: 'Invalid API key' } }
      });

      await assert.rejects(
        () => extract.extractFaqs(SAMPLE_STANDARD_TEXT, { apiKey: 'sk-bad' }),
        (err) => {
          assert.ok(err.message.includes('401'), `错误含状态码: ${err.message}`);
          assert.ok(err.message.includes('Invalid API key'), `错误含API返回信息: ${err.message}`);
          return true;
        }
      );
      resetMock();
    });

    it('handles LLM response wrapped in markdown code blocks', async () => {
      setupMock();
      mockResponses.push({
        json: { choices: [{ message: { content: '```json\n' + LLM_RESPONSE_JSON + '\n```' } }] }
      });

      const result = await extract.extractFaqs(SAMPLE_STANDARD_TEXT, { apiKey: 'sk-test' });
      assert.equal(result.length, 3, '应解析 markdown 包裹的 JSON');
      resetMock();
    });

    it('non-JSON LLM response returns empty array (graceful degradation)', async () => {
      setupMock();
      mockResponses.push({
        json: { choices: [{ message: { content: 'Sorry, I cannot answer that.' } }] }
      });

      const result = await extract.extractFaqs(SAMPLE_STANDARD_TEXT, { apiKey: 'sk-test' });
      assert.deepStrictEqual(result, [], '非 JSON 响应应返回空数组');
      resetMock();
    });
  });

  describe('extractFaqsFromFiles(filePaths)', () => {
    const tmpDir = path.join(os.tmpdir(), `faq-extract-test-${Date.now()}`);
    const filePath = path.join(tmpDir, 'test-standard.md');

    before(() => {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(filePath, SAMPLE_STANDARD_TEXT);
    });

    after(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      resetMock();
    });

    it('reads file and calls extractFaqs', async () => {
      setupMock();
      mockResponses.push({
        json: { choices: [{ message: { content: LLM_RESPONSE_JSON } }] }
      });

      const result = await extract.extractFaqsFromFiles([filePath], { apiKey: 'sk-test' });
      assert.equal(result.length, 3, '应从文件抽取 FAQ');
      assert.ok(result[0].question, '应有问题');
      resetMock();
    });

    it('nonexistent file returns rejected promise', async () => {
      setupMock();
      await assert.rejects(
        () => extract.extractFaqsFromFiles(['/nonexistent/file.md'], { apiKey: 'sk-test' }),
        { message: /not found|不存在|ENOENT/ },
        '文件不存在应拒绝'
      );
      assert.equal(fetchCalls.length, 0, '文件不存在不应调用 API');
      resetMock();
    });

    it('uses custom model when provided', async () => {
      setupMock();
      mockResponses.push({
        json: { choices: [{ message: { content: LLM_RESPONSE_JSON } }] }
      });

      await extract.extractFaqs(SAMPLE_STANDARD_TEXT, { apiKey: 'sk-test', model: 'deepseek-reasoner' });
      const body = JSON.parse(fetchCalls[0].opts.body);
      assert.equal(body.model, 'deepseek-reasoner', '应使用自定义模型');
      resetMock();
    });

    it('uses default model deepseek-chat when not specified', async () => {
      setupMock();
      mockResponses.push({
        json: { choices: [{ message: { content: LLM_RESPONSE_JSON } }] }
      });

      await extract.extractFaqs(SAMPLE_STANDARD_TEXT, { apiKey: 'sk-test' });
      const body = JSON.parse(fetchCalls[0].opts.body);
      assert.equal(body.model, 'deepseek-chat', '默认模型应为 deepseek-chat');
      resetMock();
    });
  });
});
