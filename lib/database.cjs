#!/usr/bin/env node
/**
 * kb-web 数据库初始化模块
 * - 创建 data/ 目录
 * - 建表（users, files, logs, faq, embeddings）
 * - 首次启动交互式创建管理员账号
 *
 * 使用方式: node lib/database.cjs <command>
 *   init     → 初始化数据库
 *   migrate  → 仅执行迁移（已弃用）
 *   reset    → 删除数据库重新初始化（危险！）
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');

const DB_DIR = process.env.KB_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'kb.db');

let db = null;

function getDb() {
  if (!db) {
    const Database = require('better-sqlite3');
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

const TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  md_path TEXT,
  category TEXT NOT NULL DEFAULT '其他' CHECK(category IN ('方案','报告','标准法规参考','其他')),
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS embeddings (
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  chunk_text TEXT,
  embedding BLOB,
  PRIMARY KEY (file_id, chunk_index)
);
`;

function migrateSchema() {
  const db = getDb();

  // 先初始化所有表（确保迁移可以安全地检查现有列）
  db.exec(TABLES);

  // 检查 users 表是否需要重建（旧版有 engineer role 和 CHECK 约束）
  const userCols = db.prepare("PRAGMA table_info('users')").all().map(r => r.name);
  if (!userCols.includes('status')) {
    console.log('[db] 迁移: 重建 users 表（添加 status, last_login, 更新 role）');
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        last_login TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO users_new (id, username, password_hash, role, status, created_at)
        SELECT id, username, password_hash,
          CASE WHEN role='admin' THEN 'admin' ELSE 'user' END,
          'active', created_at FROM users;
    `);
    db.exec('DROP TABLE IF EXISTS users');
    db.exec('ALTER TABLE users_new RENAME TO users');
    db.pragma('foreign_keys = ON');
  }

  // 重建 logs 表（旧版有 CHECK 约束，缺少 username/ip_address）
  const logCols = db.prepare("PRAGMA table_info('logs')").all().map(r => r.name);
  if (!logCols.includes('username') || !logCols.includes('ip_address')) {
    console.log('[db] 迁移: 重建 logs 表（添加 username, ip_address 字段）');
    db.exec('ALTER TABLE logs RENAME TO logs_old');
    db.exec(`CREATE TABLE IF NOT EXISTS logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
    db.exec("INSERT OR IGNORE INTO logs_new (id, user_id, action, detail, created_at) SELECT id, user_id, action, detail, created_at FROM logs_old");
    db.exec('DROP TABLE IF EXISTS logs_old');
    db.exec('DROP TABLE IF EXISTS logs');
    db.exec('ALTER TABLE logs_new RENAME TO logs');
  }

  // avatar 列迁移（v1.1）
  const curCols = db.prepare("PRAGMA table_info('users')").all().map(r => r.name);
  if (!curCols.includes('avatar')) {
    console.log('[db] 迁移: users 表添加 avatar 列');
    db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
  }

  // faq 表迁移（PRD-007）
  const faqCols = db.prepare("PRAGMA table_info('faq')").all().map(r => r.name);
  if (!faqCols.includes('source_file')) {
    console.log('[db] 迁移: faq 表添加 source_file, source_section, extracted 列');
    db.exec("ALTER TABLE faq ADD COLUMN source_file TEXT DEFAULT ''");
    db.exec("ALTER TABLE faq ADD COLUMN source_section TEXT DEFAULT ''");
    db.exec("ALTER TABLE faq ADD COLUMN extracted INTEGER DEFAULT 0");
  }

  console.log(`[db] 表已就绪 (${DB_PATH})`);
}

function initTables() {
  migrateSchema();
}

function hasUsers() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
  return row.cnt > 0;
}

async function createInitialAdmin() {
  if (hasUsers()) {
    console.log('[db] 已有用户，跳过初始管理员创建');
    return;
  }

  const bcrypt = require('bcryptjs');

  // 优先从环境变量读取
  const envUser = process.env.KB_ADMIN_USER;
  const envPass = process.env.KB_ADMIN_PASS;

  if (envUser && envPass && envPass.length >= 6) {
    const hash = bcrypt.hashSync(envPass, 10);
    const db = getDb();
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(envUser, hash, 'admin');
    console.log(`[db] 管理员账号 "${envUser}" 创建成功 (来自环境变量)\n`);
    return;
  }

  // 回退到交互式输入
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log('\n=== 首次启动：创建管理员账号 ===\n');

  let username, password;
  while (!username) {
    username = (await ask('管理员用户名: ')).trim();
    if (!username) console.log('用户名不能为空');
  }

  while (!password || password.length < 6) {
    password = (await ask('管理员密码 (至少6位): ')).trim();
    if (!password || password.length < 6) console.log('密码至少 6 位');
  }

  rl.close();

  const hash = bcrypt.hashSync(password, 10);
  const db = getDb();
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'admin');
  console.log(`[db] 管理员账号 "${username}" 创建成功\n`);
}

function cleanOldLogs() {
  const db = getDb();
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const result = db.prepare('DELETE FROM logs WHERE created_at < ?').run(sixMonthsAgo);
  if (result.changes > 0) {
    console.log(`[db] 已清理 ${result.changes} 条过期日志`);
  }
}

async function init() {
  getDb(); // 触发迁移
  await createInitialAdmin();
  cleanOldLogs();
  closeDb();
}

function reset() {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    // also remove WAL/SHM files
    try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
    try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
    console.log(`[db] 已删除: ${DB_PATH}`);
  }
  console.log('[db] 重置完成，请运行 init 重新创建');
}

async function main() {
  const cmd = process.argv[2] || 'init';
  switch (cmd) {
    case 'init':
      await init();
      break;
    case 'reset':
      reset();
      break;
    default:
      console.log('用法: node lib/database.cjs [init|reset]');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[db] 初始化失败:', err);
    process.exit(1);
  });
}

/**
 * 记录搜索关键词到 search_logs 表
 */
function logSearch(keyword) {
  try {
    const db = getDb();
    db.prepare('INSERT INTO search_logs (keyword) VALUES (?)').run(keyword);
    cleanSearchLogs(2000);
  } catch(e) {
    console.error('[db] logSearch error:', e.message);
  }
}

/**
 * 清理 search_logs 表，只保留最近的 N 条
 */
function cleanSearchLogs(keep = 2000) {
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as cnt FROM search_logs').get().cnt;
    if (count > keep) {
      const toDelete = count - keep;
      db.prepare('DELETE FROM search_logs WHERE id IN (SELECT id FROM search_logs ORDER BY id ASC LIMIT ?)').run(toDelete);
    }
  } catch(e) {
    console.error('[db] cleanSearchLogs error:', e.message);
  }
}

/**
 * 获取热门搜索词
 */
function getHotSearches(limit = 10) {
  const db = getDb();
  const rows = db.prepare('SELECT keyword, COUNT(*) as count FROM search_logs GROUP BY keyword ORDER BY count DESC, MAX(id) DESC LIMIT ?').all(limit);
  return rows;
}

module.exports = { getDb, closeDb, initTables, hasUsers, cleanOldLogs, logSearch, getHotSearches, cleanSearchLogs };
