## Parent

`docs/PRD-007-faq-extract-batch.md` — FAQ 智能抽取 + 批量管理

## What to build

Test suite covering the FAQ batch operations API endpoints and the extract module.

### Test files:

1. **`test/faq-extract.test.cjs`** — Unit tests for `lib/faq_extract.cjs`:
   - `extractFaqs(text)` returns correctly structured array (mock fetch returning valid JSON)
   - `extractFaqs('')` returns `[]`
   - `extractFaqs(text, {maxPairs: 3})` limits results
   - API error returns rejected promise with error
   - `extractFaqsFromFiles([...])` reads files and calls extract
   - Missing API key returns rejected promise

2. **`test/faq-batch.test.cjs`** — Integration tests (independent server instance with fresh DB):
   - Batch delete: create 3 entries, delete 2, verify 1 remains
   - Batch category: create 3 entries, batch re-categorize, verify all updated
   - Import CSV: upload CSV file, verify entries created
   - Import JSON: upload JSON file, verify entries
   - Export JSON: `/api/faq/export?format=json` returns correct JSON
   - Export CSV: `/api/faq/export?format=csv` returns correct CSV
   - Export filtered by category
   - Categories endpoint returns deduplicated list
   - Extract endpoint with mock: returns FAQ array
   - Extract missing apiKey returns 400

## Acceptance criteria

- [ ] `test/faq-extract.test.cjs` runs with `node --test` and passes all tests
- [ ] `test/faq-batch.test.cjs` runs with `node --test` and passes all tests
- [ ] Both test files follow existing test patterns (node:test, http.request, fresh DB)

## Blocked by

- `docs/ISSUE-7.2-faq-batch-api.md` (needs API endpoints to test)
