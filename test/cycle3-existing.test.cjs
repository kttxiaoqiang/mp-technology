/**
 * Cycle 3: 非首次启动 — 跳过管理员创建
 *
 * 测试项:
 *   1. 删除数据库后重新 init，已有用户保留
 *   2. 当用户已存在时，createInitialAdmin 不创建新用户
 *   3. init() 完整流程幂等
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const dbDir = path.join(os.tmpdir(), `kb-test-cycle3-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;

// 第1步: 创建数据库 + 管理员
delete require.cache[require.resolve('../lib/database.cjs')];
let mod = require('../lib/database.cjs');
mod.initTables();
process.env.KB_ADMIN_USER = 'oldadmin';
process.env.KB_ADMIN_PASS = 'oldpass123';
mod.createInitialAdmin();
mod.closeDb();

after(() => {
  delete process.env.KB_DATA_DIR;
  delete process.env.KB_ADMIN_USER;
  delete process.env.KB_ADMIN_PASS;
  fs.rmSync(dbDir, { recursive: true, force: true });
});

it('重新加载数据库后，已有用户应保留', () => {
  delete require.cache[require.resolve('../lib/database.cjs')];
  mod = require('../lib/database.cjs');

  const db = mod.getDb();
  const user = db.prepare("SELECT * FROM users WHERE username = 'oldadmin'").get();
  assert.ok(user, 'user oldadmin 应保留');
  assert.equal(user.role, 'admin');
});

it('hasUsers() 返回 true', () => {
  assert.equal(mod.hasUsers(), true);
});

it('createInitialAdmin() 在已有用户时不创建新用户', () => {
  const db = mod.getDb();
  const countBefore = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;

  process.env.KB_ADMIN_USER = 'newadmin';
  process.env.KB_ADMIN_PASS = 'newpass123';
  mod.createInitialAdmin();

  const countAfter = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  assert.equal(countAfter, countBefore, '用户数不应增加');
});

it('init() 完整流程应幂等', () => {
  const db = mod.getDb();
  const countBefore = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;

  // 修改环境变量测试 init() 是否创建新用户
  process.env.KB_ADMIN_USER = 'yetadmin';
  process.env.KB_ADMIN_PASS = 'yetpass123';
  mod.init();

  const countAfter = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  assert.equal(countAfter, countBefore, 'init 不应创建新用户');
});
