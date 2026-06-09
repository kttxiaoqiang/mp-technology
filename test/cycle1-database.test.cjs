/**
 * Cycle 1: 数据库连接 + 建表
 *
 * 测试项:
 *   1. getDb() 返回数据库实例
 *   2. initTables() 创建所有表
 *   3. 再次调用 initTables() 幂等
 *   4. hasUsers() 空表返回 false
 *   5. WAL模式 + 外键约束
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 临时目录
const dbDir = path.join(os.tmpdir(), `kb-test-cycle1-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;

// 清模块缓存
delete require.cache[require.resolve('../lib/database.cjs')];
const mod = require('../lib/database.cjs');

after(() => {
  mod.closeDb();
  fs.rmSync(dbDir, { recursive: true, force: true });
  delete process.env.KB_DATA_DIR;
});

it('getDb() 应返回数据库实例', () => {
  const db = mod.getDb();
  assert.ok(db, '不应返回 null/undefined');
  assert.equal(typeof db.prepare, 'function', '应有 prepare 方法');
});

it('initTables() 应创建 users, files, logs, faq, embeddings 表', () => {
  mod.initTables();
  const db = mod.getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  const expected = ['embeddings', 'faq', 'files', 'logs', 'users'];
  for (const t of expected) {
    assert.ok(tables.includes(t), `表 ${t} 应存在`);
  }
});

it('再次调用 initTables() 应幂等', () => {
  mod.initTables(); // 不应抛出
  assert.ok(true);
});

it('hasUsers() 在无用户时返回 false', () => {
  assert.equal(mod.hasUsers(), false);
});

it('WAL 模式和 foreign_keys 已启用', () => {
  const db = mod.getDb();
  assert.equal(db.pragma('journal_mode').journal_mode.toLowerCase(), 'wal');
  assert.equal(db.pragma('foreign_keys').foreign_keys, 1);
});
