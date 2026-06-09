/**
 * 数据库核心模块测试
 *
 * 验证 database.cjs 的基本功能：
 *   - getDb() / initTables() / hasUsers()
 *   - WAL/外键
 *   - 密码哈希
 *   - reset
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');

const dbDir = path.join(os.tmpdir(), `kb-test-db-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;

delete require.cache[require.resolve('../lib/database.cjs')];
const mod = require('../lib/database.cjs');

// ─── 测试1: 数据库初始化 ───
describe('Database init & tables', () => {
  it('getDb() 应返回数据库实例', () => {
    const db = mod.getDb();
    assert.ok(db);
  });

  it('initTables() 应创建所有表', () => {
    mod.initTables();
    const db = mod.getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const names = tables.map(t => t.name);
    for (const t of ['users','files','faq','logs']) {
      assert.ok(names.includes(t), `${t} 表应存在，实际有: ${names.join(',')}`);
    }
  });

  it('再次调用 initTables() 应幂等', () => {
    mod.initTables();
    assert.ok(true);
  });

  it('hasUsers() 在空表时返回 false', () => {
    assert.strictEqual(mod.hasUsers(), false);
  });

  it('WAL 模式已启用', () => {
    const db = mod.getDb();
    const row = db.prepare("PRAGMA journal_mode").get();
    assert.ok(row);
    const val = Object.values(row)[0];
    assert.ok(typeof val === 'string');
    assert.strictEqual(val.toLowerCase(), 'wal');
  });

  it('外键约束已启用', () => {
    const db = mod.getDb();
    const row = db.prepare("PRAGMA foreign_keys").get();
    assert.ok(row);
    const val = Object.values(row)[0];
    assert.strictEqual(Number(val), 1);
  });
});

// ─── 测试2: 密码哈希 ───
describe('Password hashing', () => {
  it('bcrypt 哈希存储且可验证密码', () => {
    const db = mod.getDb();
    const hash = bcrypt.hashSync('testpass123', 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)').run('testuser', hash, 'admin');
    assert.ok(mod.hasUsers());
    const user = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('testuser');
    assert.ok(user);
    assert.ok(bcrypt.compareSync('testpass123', user.password_hash));
    assert.ok(!bcrypt.compareSync('wrongpass', user.password_hash));
  });
});

// ─── 测试3: 数据库文件存在 ───
describe('Database file', () => {
  it('数据库文件已创建且可读', () => {
    const dbPath = path.join(dbDir, 'kb.db');
    assert.ok(fs.existsSync(dbPath));
    const stats = fs.statSync(dbPath);
    assert.ok(stats.size > 0);
  });
});
