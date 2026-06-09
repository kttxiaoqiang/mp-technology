/**
 * Cycle 2: 管理员创建
 *
 * 测试项:
 *   1. createInitialAdmin() 通过环境变量创建管理员
 *   2. 密码以 bcrypt 哈希存储
 *   3. 角色为 admin
 *   4. 再次调用不重复创建
 *   5. 无环境变量时跳过创建（不卡住）
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const dbDir = path.join(os.tmpdir(), `kb-test-cycle2-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;

delete require.cache[require.resolve('../lib/database.cjs')];
const mod = require('../lib/database.cjs');
mod.initTables();

after(() => {
  mod.closeDb();
  fs.rmSync(dbDir, { recursive: true, force: true });
  delete process.env.KB_DATA_DIR;
});

it('createInitialAdmin() 应通过 KB_ADMIN_USER/PASS 环境变量创建管理员', () => {
  process.env.KB_ADMIN_USER = 'testadmin';
  process.env.KB_ADMIN_PASS = 'testpass123';

  mod.createInitialAdmin();

  const db = mod.getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get('testadmin');
  assert.ok(user, '用户应存在于数据库');
  assert.equal(user.role, 'admin', '角色应为 admin');

  delete process.env.KB_ADMIN_USER;
  delete process.env.KB_ADMIN_PASS;
});

it('密码应以 bcrypt 存储', () => {
  const db = mod.getDb();
  const user = db.prepare("SELECT * FROM users WHERE username = 'testadmin'").get();

  assert.ok(user.password_hash.startsWith('$2'), 'bcrypt hash 以 $2 开头');
  assert.ok(user.password_hash.length >= 59, 'bcrypt hash 长度 >= 59');

  const bcrypt = require('bcryptjs');
  assert.ok(bcrypt.compareSync('testpass123', user.password_hash), '正确密码应验证通过');
  assert.equal(bcrypt.compareSync('wrongpass', user.password_hash), false, '错误密码应拒绝');
});

it('hasUsers() 现在应返回 true', () => {
  assert.equal(mod.hasUsers(), true);
});

it('二次调用 createInitialAdmin() 不应重复创建', () => {
  const db = mod.getDb();
  const countBefore = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;

  process.env.KB_ADMIN_USER = 'anotheradmin';
  process.env.KB_ADMIN_PASS = 'anotherpass';
  mod.createInitialAdmin();

  const countAfter = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  assert.equal(countAfter, countBefore, '用户数不应增加');

  delete process.env.KB_ADMIN_USER;
  delete process.env.KB_ADMIN_PASS;
});
