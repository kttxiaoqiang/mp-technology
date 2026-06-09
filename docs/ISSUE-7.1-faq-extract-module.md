## Parent

`docs/PRD-007-faq-extract-batch.md` — FAQ 智能抽取 + 批量管理

## What to build

The deep module `lib/faq_extract.cjs` — a self-contained module that wraps DeepSeek API (OpenAI-compatible) for extracting FAQ Q&A pairs from standard document text.

This slice covers:

- `lib/faq_extract.cjs` with `extractFaqs(text, options)` and `extractFaqsFromFiles(filePaths, options)` functions
- API call construction (prompt template, model selection, temperature)
- Response parsing (extracting JSON array from LLM reply, with fallback for markdown-wrapped JSON)
- Error handling (network errors, non-JSON responses, empty results)
- Optional chunking for large files (>32K tokens, split by markdown headings)
- Unit test with mock HTTP responses

## Acceptance criteria

- [ ] `extractFaqs(text)` called with a standard document returns `[{question, answer, category, source_section}]` array
- [ ] `extractFaqs('')` returns empty array
- [ ] `extractFaqs(text, {maxPairs: 3})` returns at most 3 pairs
- [ ] API network failure returns rejected promise with descriptive error
- [ ] `extractFaqsFromFiles(['/path/to/doc.md'])` reads file and extracts FAQs
- [ ] Missing API key returns rejected promise `'API key is required'`
- [ ] Large files (>32K chars) are auto-chunked by markdown heading boundaries

## Blocked by

None — can start immediately, no server/route dependencies.
