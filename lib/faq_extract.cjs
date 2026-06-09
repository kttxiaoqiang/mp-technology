/**
 * lib/faq_extract.cjs — DeepSeek API 驱动的 FAQ 智能抽取模块
 *
 * 封装 LLM 调用的全部复杂性：API 密钥、请求构建、重试、响应解析。
 * 公开接口简单稳定，内部实现可独立迭代。
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_MAX_PAIRS = 10;
const DEFAULT_MAX_TOKENS = 2048;

/**
 * 默认 Prompt 模板
 */
const DEFAULT_PROMPT_TEMPLATE = `你是一名密评专家。从文档提取问答对，只输出 JSON 数组，不要解释：

[
  {"question": "...", "answer": "...", "category": "合规要求", "source_section": "章节号"}
]

分类：基础概念|合规要求|技术标准|检测方法|密钥管理|安全管理|应用场景

文档：
{text}`;

/**
 * 发送请求到 DeepSeek API
 */
async function callLLM(text, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error('API key is required');
  }

  const model = options.model || DEFAULT_MODEL;
  const temperature = options.temperature != null ? options.temperature : DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  const promptTemplate = options.promptTemplate || DEFAULT_PROMPT_TEMPLATE;

  const prompt = promptTemplate.replace('{text}', text);

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false
    })
  });

  if (!response.ok) {
    let errorBody = '';
    try { errorBody = JSON.stringify(await response.json()); } catch { errorBody = await response.text(); }
    throw new Error(`LLM API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '';

  return rawContent;
}

/**
 * 从 LLM 响应中提取 JSON 数组
 * 处理 markdown 代码块包裹的情况
 */
function parseJSONResponse(rawContent) {
  if (!rawContent || rawContent.trim().length === 0) {
    return [];
  }

  let jsonStr = rawContent.trim();

  // 去掉 markdown 代码块包裹（兼容各种换行格式）
  // 情况1：标准 ```json ... ``` 包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else if (jsonStr.includes('```')) {
    // 情况2：有不完整的代码块标记，替换掉所有 ```
    jsonStr = jsonStr.replace(/```(?:json)?\s*/g, '').replace(/\s*```/g, '').trim();
  }

  // 增加总 token 限制避免截断
  const maxJsonLen = 16000;
  if (jsonStr.length > maxJsonLen) {
    jsonStr = jsonStr.slice(0, maxJsonLen);
    // 找到最后一个完整的大括号或方括号对
    const lastBrace = jsonStr.lastIndexOf('}');
    const lastBracket = jsonStr.lastIndexOf(']');
    const cutAt = Math.max(lastBrace, lastBracket);
    if (cutAt > 0) jsonStr = jsonStr.slice(0, cutAt + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // 如果返回的是对象且包含 items/results 等包装键
    if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
    if (parsed.results && Array.isArray(parsed.results)) return parsed.results;
    if (parsed.faqs && Array.isArray(parsed.faqs)) return parsed.faqs;
    throw new Error('LLM response is not an array');
  } catch (err) {
    if (err.message === 'LLM response is not an array') throw err;
    console.error('[parseJSONResponse] 解析失败:', err.message.slice(0, 80));
    return [];
  }
}

/**
 * 验证并规范化单个 FAQ 条目
 */
function normalizeFAQItem(item) {
  if (!item.question || !item.answer) return null;
  return {
    question: String(item.question).trim(),
    answer: String(item.answer).trim(),
    category: String(item.category || '其他').trim(),
    source_section: String(item.source_section || '').trim()
  };
}

/**
 * 从标准正文中提取 FAQ 条目
 *
 * @param {string} text - 标准文档的完整 markdown 文本
 * @param {object} options
 * @param {string} options.apiKey - DeepSeek API 密钥
 * @param {string} [options.model='deepseek-chat'] - 模型名称
 * @param {number} [options.maxPairs=50] - 最大问答对数
 * @param {number} [options.temperature=0.1] - 生成温度
 * @param {string} [options.promptTemplate] - 自定义 prompt 模板
 * @returns {Promise<Array<{question:string, answer:string, category:string, source_section:string}>>}
 */
async function extractFaqs(text, options = {}) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  if (!options.apiKey) {
    throw new Error('API key is required');
  }

  const maxPairs = options.maxPairs || DEFAULT_MAX_PAIRS;
  const rawContent = await callLLM(text, options);
  const parsed = parseJSONResponse(rawContent);

  // 规范化、去空
  const faqs = parsed.map(normalizeFAQItem).filter(Boolean);

  // 限制数量
  return faqs.slice(0, maxPairs);
}

/**
 * 从多个文件中抽取 FAQ
 *
 * @param {string[]} filePaths - 标准文档路径列表
 * @param {object} options - 同 extractFaqs
 * @returns {Promise<Array<{question, answer, category, source_section}>>}
 */
async function extractFaqsFromFiles(filePaths, options = {}) {
  if (!options.apiKey) {
    throw new Error('API key is required');
  }

  const texts = [];
  for (const fp of filePaths) {
    if (!require('fs').existsSync(fp)) {
      throw new Error(`File not found: ${fp}`);
    }
    const content = require('fs').readFileSync(fp, 'utf-8');
    const fileName = require('path').basename(fp);
    texts.push({ filePath: fp, fileName, content });
  }

  if (texts.length === 0) return [];

  // 合并所有文件内容（标注文件名以便 LLM 引用）
  let combinedText = '';
  for (const t of texts) {
    combinedText += `# 文件：${t.fileName}\n${t.content}\n\n`;
  }

  // 注入 source_file 回退
  const faqs = await extractFaqs(combinedText, options);
  return faqs.map(faq => ({
    ...faq,
    source_file: faq.source_file || (texts.length === 1 ? texts[0].fileName : undefined)
  }));
}

/**
 * 将长文档分块后分别抽取 FAQ，适合密评FAQ类型的长文档
 * 每块独立调用 LLM，最终合并结果并去重
 *
 * @param {string} text - 完整文档内容
 * @param {object} options
 * @param {string} options.apiKey - API 密钥
 * @param {number} [options.chunkSize=8000] - 每块字符数
 * @param {number} [options.overlap=200] - 块间重叠字符数
 * @param {number} [options.maxPairsPerChunk=20] - 每块最大问答对数
 * @param {number} [options.maxTokensPerChunk=4096] - 每块输出 token 上限
 * @returns {Promise<Array<{question, answer, category, source_section}>>}
 */
async function extractFaqsFromChunks(text, options = {}) {
  if (!text || text.trim().length === 0) return [];

  const chunkSize = options.chunkSize || 8000;
  const overlap = options.overlap || 200;

  // 切分文档
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      // 尽量在段落边界切分
      const after = text.substring(end - overlap, end + 200);
      // 找最近的换行后的段落开头
      const nlIdx = text.indexOf('\n', start + chunkSize - overlap);
      if (nlIdx >= 0 && nlIdx < start + chunkSize + 200) {
        end = nlIdx + 1;
      } else {
        end = Math.min(end, text.length);
      }
    } else {
      end = text.length;
    }
    chunks.push(text.substring(start, end));
    start = end;
  }

  console.log('[extractFaqsFromChunks] 文档已切分为', chunks.length, '块');

  // 逐块抽取
  const allFaqs = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log('[extractFaqsFromChunks] 处理第', (i + 1), '/', chunks.length, '块...');
      const faqs = await extractFaqs(chunks[i], {
        apiKey: options.apiKey,
        maxPairs: options.maxPairsPerChunk || 20,
        maxTokens: options.maxTokensPerChunk || 4096
      });
      if (faqs && faqs.length > 0) {
        console.log('[extractFaqsFromChunks] 第', (i + 1), '块: 抽取', faqs.length, '条');
        allFaqs.push(...faqs);
      } else {
        console.log('[extractFaqsFromChunks] 第', (i + 1), '块: 空结果');
      }
    } catch (e) {
      console.error('[extractFaqsFromChunks] 第', (i + 1), '块失败:', e.message);
    }
  }

  console.log('[extractFaqsFromChunks] 共抽取', allFaqs.length, '条（分块后）');
  return allFaqs;
}

module.exports = { extractFaqs, extractFaqsFromFiles, extractFaqsFromChunks };
