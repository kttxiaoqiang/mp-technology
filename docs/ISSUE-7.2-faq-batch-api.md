## Parent

`docs/PRD-007-faq-extract-batch.md` — FAQ 智能抽取 + 批量管理

## What to build

Backend API endpoints for FAQ bulk actions and the extract endpoint. Integrates `lib/faq_extract.cjs` from Issue 7.1.

This slice covers:

- `POST /api/faq/extract` — accepts `{ files: [...], apiKey, options }`, calls `extractFaqsFromFiles`, returns extracted Q&A pairs (NOT auto-imported — returned for preview)
- `POST /api/faq/batch-delete` — accepts `{ ids: [1,2,3] }`, deletes all specified FAQ entries, logs to operation log
- `PUT /api/faq/batch-category` — accepts `{ ids: [1,2,3], category: "等保" }`, updates all specified entries
- `POST /api/faq/import` — accepts multipart with csv/json file, parses and bulk-inserts FAQ entries
- `GET /api/faq/export` — accepts `?format=csv|json&category=xxx`, returns file download
- `GET /api/faq/categories` — returns deduplicated category list
- Database migration: add `source_file`, `source_section`, `extracted` columns to `faq` table (ALTER TABLE for backward compatibility)
- All endpoints require admin role

## Acceptance criteria

- [ ] `POST /api/faq/extract` with valid files + apiKey returns `{faqs: [{question, answer, category, source_section}]}` array
- [ ] `POST /api/faq/extract` with missing apiKey returns 400
- [ ] `POST /api/faq/batch-delete` deletes specified IDs only
- [ ] `PUT /api/faq/batch-category` updates category for specified IDs
- [ ] `POST /api/faq/import` with CSV file creates FAQ entries and returns count
- [ ] `POST /api/faq/import` with JSON file creates FAQ entries
- [ ] `GET /api/faq/export?format=csv` downloads CSV with correct headers
- [ ] `GET /api/faq/export?format=json` downloads JSON array
- [ ] `GET /api/faq/export?format=json&category=等保` filters by category
- [ ] `GET /api/faq/categories` returns sorted unique list
- [ ] All batch operations are logged to operation logs
- [ ] Existing `faq` table schema unchanged (new columns via ALTER TABLE)

## Blocked by

- `docs/ISSUE-7.1-faq-extract-module.md` (needs `lib/faq_extract.cjs`)
