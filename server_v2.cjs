// ═══════════════════════════════════════════════════
// KB-Web Server v2 — 密码应用知识库系统
// 核心架构：qmd 语义搜索 + 文件转换 + 自动索引
// ═══════════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');

const { log, getLogs } = require('./lib/logger.cjs');
const { getDb } = require('./lib/database.cjs');

// ─── 路径常量 ──────────────────────────────────
const KB_DIR = process.env.KB_DIR || '/home/zhang/company_knowledge_base';
const UPLOAD_DIR = path.join(KB_DIR, 'store');     // 原始文件目录
const MD_CACHE_DIR = path.join(KB_DIR, 'md');       // 转 md 缓存
const DB_PATH = path.join(KB_DIR, '../kb-web/kb_data/kb.db');
// qmd 在 PATH 中（`/usr/bin/qmd`），直接用 bare name
const QMD_BIN = 'qmd';
const QMD_COLLECTION = 'company_knowledge_base';

// 确保目录存在
[UPLOAD_DIR, MD_CACHE_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const CATEGORIES = ['方案', '报告', '密评FAQ', '标准规范', '法规政策', '注册材料', '参考文档', '其他'];
const ALLOWED_EXTS = ['.txt', '.md', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.json', '.csv', '.xml', '.yaml', '.yml'];

// ─── Python 配置 ──────────────────────────────────
const KB_PYTHON = process.env.KB_PYTHON || '/home/zhang/桌面/openclaw-env/bin/python3';

// ─── Express 应用 ────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'kb-secret-' + crypto.randomBytes(8).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Multer 配置：存储到 store/ 目录
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const origName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(origName);
    // 带原文件名前缀便于识别
    const base = path.basename(origName, ext).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
    const ts = Date.now();
    const safeName = `${base}_${ts}${ext}`;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.includes(ext)) return cb(null, true);
    cb(new Error(`不支持的文件类型: ${ext}，允许: ${ALLOWED_EXTS.join(', ')}`));
  }
});

// ─── 认证中间件 ──────────────────────────────────
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: '未登录' });
}
function isAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).json({ error: '无权限' });
}

// ─── 工具函数 ────────────────────────────────────

/** 自动分类文件名 */
function autoCategory(originalName, content = '') {
  const name = originalName.toLowerCase();
  const text = (name + ' ' + content).toLowerCase();
  if (/\b方案\b/.test(text) && !/\b报告\b/.test(text)) return '方案';
  if (/\b报告\b/.test(text)) return '报告';
  if (/\bFAQ\b|\b密评\b/.test(text)) return '密评FAQ';
  if (/\b标准\b|\b规范\b|\bGB\b|\bGMT\b/.test(text)) return '标准规范';
  if (/\b法规\b|\b政策\b|\b办法\b|\b通知\b/.test(text)) return '法规政策';
  if (/\b注册\b|\b申请\b|\b备案\b/.test(text)) return '注册材料';
  if (/\b参考\b|\b资料\b|\b文档\b/.test(text)) return '参考文档';
  return '其他';
}

/** 文本 → 生成 md 内容 */
function textToMarkdown(text, originalName) {
  const title = path.basename(originalName, path.extname(originalName));
  const now = new Date().toISOString().split('T')[0];
  return `---\ntitle: "${title}"\nsource: "${originalName}"\ncreated: ${now}\n---\n\n${text}`;
}

/**
 * convertToMd — 文件转 Markdown
 * 输入: storePath（原始文件路径）, originalName
 * 输出: { md_path, content } 或 null
 * 优先级: 文本直接读取 → markitdown → LibreOffice
 */
async function convertToMd(storePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const textExts = ['.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml'];

  // 目标 md 文件路径
  const mdName = path.basename(originalName, ext) + '.md';
  const mdPath = path.join(MD_CACHE_DIR, mdName);

  // 已存在则直接返回
  if (fs.existsSync(mdPath)) return { md_path: mdPath, content: fs.readFileSync(mdPath, 'utf8') };

  let markdown = null;

  // 1. 文本文件直接读取
  if (textExts.includes(ext)) {
    const raw = fs.readFileSync(storePath, 'utf-8');
    markdown = textToMarkdown(raw, originalName);
  }

  // 2. MarkItDown（Python）
  if (!markdown) {
    try {
      const pyScript = path.join(__dirname, 'lib', 'convert_markitdown.py');
      if (fs.existsSync(pyScript)) {
        const result = execSync(
          `"${KB_PYTHON}" "${pyScript}" "${storePath}" 2>/dev/null`,
          { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
        ).toString().trim();
        if (result) markdown = textToMarkdown(result, originalName);
      }
    } catch (e) { /* fallback */ }
  }

  // 3. LibreOffice（二进制文档 → txt → md）
  if (!markdown) {
    const tmpTxt = storePath + '_lo.txt';
    try {
      execSync(
        `libreoffice --headless --convert-to txt:"Text" --outdir "${path.dirname(tmpTxt)}" "${storePath}" 2>/dev/null`,
        { timeout: 30000 }
      );
      if (fs.existsSync(tmpTxt)) {
        const raw = fs.readFileSync(tmpTxt, 'utf-8');
        markdown = textToMarkdown(raw, originalName);
        try { fs.unlinkSync(tmpTxt); } catch (e) { /* cleanup */ }
      }
    } catch (e) { /* no more fallbacks */ }
  }

  if (!markdown) return null;

  // 写入缓存
  fs.writeFileSync(mdPath, markdown, 'utf-8');
  return { md_path: mdPath, content: markdown };
}

/** 触发 qmd 索引更新（异步后台） */
function triggerQmdIndex() {
  const script = path.join(__dirname, 'lib', 'qmd-index.cjs');
  if (!fs.existsSync(script)) {
    // 直接 exec
    const cmd = `cd "${KB_DIR}" && ${QMD_BIN} update 2>/dev/null && ${QMD_BIN} embed 2>/dev/null`;
    execSync(cmd, { timeout: 60000, stdio: 'ignore' });
    return;
  }
  execSync(`node "${script}" 2>/dev/null`, { timeout: 60000, stdio: 'ignore' });
}

// ═══════════════════════════════════════════════════
// 认证 API
// ═══════════════════════════════════════════════════

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });

  // 优先 bcrypt (数据库存储格式), 兼容旧版 SHA256+salt
  let valid = false;
  if (user.password_hash && user.password_hash.startsWith('$2')) {
    const bcrypt = require('bcryptjs');
    valid = bcrypt.compareSync(password, user.password_hash);
  } else if (user.salt) {
    const hash = crypto.createHash('sha256').update(password + user.salt).digest('hex');
    valid = (hash === user.password_hash);
  }
  if (!valid) return res.status(401).json({ error: '用户名或密码错误' });

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;

  log(user.id, 'login', `用户 ${username} 登录`);
  res.json({ id: user.id, username: user.username, role: user.role });
});

app.get('/api/auth/me', isAuthenticated, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, role, avatar FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  res.json(user);
});

// ─── 头像 API ────────────────────────────────
app.get('/api/auth/avatar', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: '未登录' });
  const db = getDb();
  const user = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.session.userId);
  if (user && user.avatar) return res.json({ avatar: user.avatar });
  return res.json({ avatar: null });
});

app.post('/api/auth/avatar', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: '未登录' });
  upload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: '文件上传失败' });
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    try {
      const ext = req.file.originalname.split('.').pop().toLowerCase();
      if (!['png','jpg','jpeg','gif','webp','svg'].includes(ext)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '不支持的文件格式' });
      }
      const buf = fs.readFileSync(req.file.path);
      if (buf.length > 2 * 1024 * 1024) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '图片不能超过 2MB' });
      }
      const base64 = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${buf.toString('base64')}`;
      fs.unlinkSync(req.file.path);
      const db = getDb();
      db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(base64, req.session.userId);
      const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
      log(req.session.userId, 'avatar_upload', `用户 ${req.session.username} 上传头像`);
      return res.json({ success: true, avatar: base64 });
    } catch (e) {
      return res.status(500).json({ error: '处理图片失败' });
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.session.userId) log(req.session.userId, 'logout', `用户 ${req.session.username} 退出`);
  req.session.destroy();
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
// 文件上传 API
// ═══════════════════════════════════════════════════

app.post('/api/upload', isAuthenticated, async (req, res) => {
  try {
    // multer upload
    await new Promise((resolve, reject) => {
      upload.single('file')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (!req.file) return res.status(400).json({ error: '未选择文件' });

    // 解析文件名（处理中文编码）
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const storePath = req.file.path;

    // 自动分类
    let content = '';
    try {
      if (fs.statSync(storePath).size < 1024 * 1024) {
        content = fs.readFileSync(storePath, 'utf-8');
      }
    } catch (e) { /* binary file */ }
    const category = autoCategory(originalName, content);

    // 转换 md
    const convertResult = await convertToMd(storePath, originalName);
    const mdPath = convertResult ? convertResult.md_path : null;

    // 写入数据库
    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO files (original_name, storage_path, md_path, category, file_size, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
    );
    const result = stmt.run(originalName, storePath, mdPath, category, req.file.size);
    const fileId = result.lastInsertRowid;

    log(req.session.userId, 'upload', `文件: ${originalName}, 分类: ${category}, md: ${mdPath ? '成功' : '失败'}`);

    // 后台触发 qmd 索引更新
    try {
      triggerQmdIndex();
    } catch (e) { /* async, non-blocking */ }

    res.json({
      id: fileId,
      original_name: originalName,
      category,
      md_ok: !!mdPath
    });

  } catch (err) {
    console.error('[upload error]', err.message);
    if (!res.headersSent) {
      res.status(400).json({ error: err.message || '上传失败' });
    }
  }
});

// 文件下载
app.get('/api/files/download/:id', isAuthenticated, (req, res) => {
  const db = getDb();
  const file = db.prepare('SELECT *, storage_path AS store_path FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: '文件不存在' });
  if (!file.store_path || !fs.existsSync(file.store_path)) return res.status(404).json({ error: '文件已被删除' });

  res.download(file.store_path, file.original_name);
});

// 文件列表
app.get('/api/files', isAuthenticated, (req, res) => {
  const db = getDb();
  const category = req.query.category || '';
  let rows;
  if (category && CATEGORIES.includes(category)) {
    rows = db.prepare('SELECT id, original_name, category, md_path, storage_path AS store_path, file_size, created_at FROM files WHERE category = ? ORDER BY created_at DESC').all(category);
  } else {
    rows = db.prepare('SELECT id, original_name, category, md_path, storage_path AS store_path, file_size, created_at FROM files ORDER BY created_at DESC').all();
  }
  // 标记文件是否存在
  rows = rows.map(r => ({ ...r, file_exists: fs.existsSync(r.store_path || '') }));
  res.json(rows);
});

// 删除文件
app.delete('/api/files/:id', isAuthenticated, isAdmin, (req, res) => {
  const db = getDb();
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: '文件不存在' });

  // 删除原始文件和 md 缓存
  try { if (file.store_path && fs.existsSync(file.store_path)) fs.unlinkSync(file.store_path); } catch (e) {}
  try { if (file.md_path && fs.existsSync(file.md_path)) fs.unlinkSync(file.md_path); } catch (e) {}

  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  log(req.session.userId, 'delete', `删除文件: ${file.original_name}`);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
// QMD 搜索 — 主搜索入口
// ═══════════════════════════════════════════════════

/**
 * qmd 语义搜索
 * 使用 qmd query 命令：BM25 全文 + 向量语义 + 可选 LLM expand
 * --no-rerank 跳过 LLM rerank，纯 RRF 分数混合，CPU 友好
 * 
 * 返回值: Map<md_path, { score, snippet, docid }>
 */
function qmdSearch(query) {
  const map = new Map();
  if (!fs.existsSync(QMD_BIN)) return map;

  try {
    const escapedQ = query.replace(/"/g, '\\"');
    // qmd query = 自动 expand（语义扩展）+ BM25 + 向量 + rerank
    // 用 --no-rerank 跳过 LLM rerank（纯 RRF 分数，速度快）
    const cmd = `${QMD_BIN} query "${escapedQ}" -c ${QMD_COLLECTION} -n 20 --json --no-rerank 2>/dev/null`;
    const out = execSync(cmd, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }).toString().trim();

    if (!out || !out.startsWith('[')) return map;

    for (const item of JSON.parse(out)) {
      // file 格式: qmd://company_knowledge_base/relative/path.md
      const relPath = (item.file || '').replace(/^qmd:\/\/[^/]+\//, '');
      const mdPath = path.join(KB_DIR, relPath);

      if (fs.existsSync(mdPath)) {
        const cur = map.get(mdPath);
        const score = item.score || 0;
        if (!cur || score > cur.score) {
          map.set(mdPath, { score, snippet: item.snippet || '' });
        }
      }
    }
  } catch (e) {
    // qmd 不可用时静默降级
  }

  return map;
}

/**
 * grep 原文搜索 — 兜底方案
 * 当 qmd 索引未更新时，直接搜索 md 文件内容
 */
function grepSearch(query, rows) {
  const qLower = query.toLowerCase();
  const grepResults = new Map();

  for (const file of rows) {
    if (!file.md_path || !fs.existsSync(file.md_path)) continue;
    try {
      const stats = fs.statSync(file.md_path);
      if (stats.size > 5 * 1024 * 1024) continue;

      const content = fs.readFileSync(file.md_path, 'utf8');
      const contentLower = content.toLowerCase();
      const idx = contentLower.indexOf(qLower);
      if (idx === -1) continue;

      const start = Math.max(0, idx - 60);
      const end = Math.min(content.length, idx + q.length + 60);
      const snippet = content.slice(start, end).replace(/\n+/g, ' ').slice(0, 200);

      grepResults.set(file.md_path, {
        snippet: snippet.length > 200 ? snippet.slice(0, 200) + '...' : snippet
      });
    } catch (e) { /* skip problematic files */ }
  }

  return grepResults;
}

// ─── 搜索 API ──────────────────────────────────
app.get('/api/search', isAuthenticated, (req, res) => {
  const q = (req.query.q || '').trim();
  const category = req.query.category || '';
  if (!q) return res.json([]);

  const db = getDb();

  // 查数据库
  let rows;
  if (category && CATEGORIES.includes(category)) {
    rows = db.prepare('SELECT id, original_name, category, md_path, created_at FROM files WHERE category = ? ORDER BY created_at DESC').all(category);
  } else {
    rows = db.prepare('SELECT id, original_name, category, md_path, created_at FROM files ORDER BY created_at DESC').all();
  }

  // ═══ Phase 1: QMD 语义搜索（主力） ═══
  const qmdResultMap = qmdSearch(q);

  // ═══ Phase 2: grep 关键词兜底 ═══
  const grepResultMap = grepSearch(q, rows);

  // ═══ 合并结果 ═══
  const seen = new Set();
  const results = [];

  // 先出 qmd 结果，按 score 降序
  const qmdEntries = [...qmdResultMap.entries()].sort((a, b) => b[1].score - a[1].score);
  for (const [mdPath, match] of qmdEntries) {
    const file = rows.find(r => r.md_path === mdPath);
    if (!file || seen.has(mdPath)) continue;
    seen.add(mdPath);

    let snippet = match.snippet
      ? match.snippet.replace(/@@/g, '').trim().replace(/\n+/g, ' ').slice(0, 200)
      : '';

    // 检查 grep 是否也有命中
    const grepMatch = grepResultMap.has(mdPath);
    if (grepMatch && !snippet) {
      snippet = grepResultMap.get(mdPath).snippet;
    }

    results.push({
      id: file.id,
      original_name: file.original_name,
      category: file.category,
      snippet,
      download_url: `/api/files/download/${file.id}`,
      _score: match.score,
      _method: grepMatch ? 'qmd+grep' : 'qmd',
      created_at: file.created_at
    });
  }

  // 再出 grep 独中结果
  for (const [mdPath, match] of grepResultMap) {
    if (seen.has(mdPath)) continue;
    const file = rows.find(r => r.md_path === mdPath);
    if (!file) continue;
    seen.add(mdPath);

    results.push({
      id: file.id,
      original_name: file.original_name,
      category: file.category,
      snippet: match.snippet,
      download_url: `/api/files/download/${file.id}`,
      _score: null,
      _method: 'grep',
      created_at: file.created_at
    });
  }

  res.json(results.slice(0, 50));
});

// ═══════════════════════════════════════════════════
// QMD 索引管理
// ═══════════════════════════════════════════════════

app.post('/api/qmd/reindex', isAuthenticated, (req, res) => {
  try {
    const out1 = execSync(`cd "${KB_DIR}" && ${QMD_BIN} update 2>&1`, { timeout: 120000 }).toString();
    const out2 = execSync(`cd "${KB_DIR}" && ${QMD_BIN} embed 2>&1`, { timeout: 120000 }).toString();
    log(req.session.userId, 'upload', `手动触发 qmd 索引更新`);
    res.json({ success: true, update: out1.trim(), embed: out2.trim() });
  } catch (e) {
    res.json({ success: true, output: e.stdout?.toString() || e.message });
  }
});

app.get('/api/qmd/status', isAuthenticated, (req, res) => {
  try {
    const out = execSync(`${QMD_BIN} status 2>&1`, { timeout: 10000 }).toString();
    res.json({ status: out.trim() });
  } catch (e) {
    res.json({ status: 'qmd 不可用', error: e.message });
  }
});

// ═══════════════════════════════════════════════════
// FAQ API
// ═══════════════════════════════════════════════════

app.get('/api/faq', isAuthenticated, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM faq ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/faq', isAuthenticated, isAdmin, (req, res) => {
  const { question, answer, category } = req.body || {};
  if (!question || !answer) return res.status(400).json({ error: '问题及答案必填' });

  const db = getDb();
  const result = db.prepare(
    `INSERT INTO faq (question, answer, category, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  ).run(question, answer, category || '通用');

  log(req.session.userId, 'upload', `添加FAQ: ${question.substring(0, 30)}`);
  res.json({ id: result.lastInsertRowid, success: true });
});

app.put('/api/faq', isAuthenticated, isAdmin, (req, res) => {
  const { id, question, answer, category } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID必填' });

  const db = getDb();
  db.prepare(
    `UPDATE faq SET question = ?, answer = ?, category = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(question, answer, category, id);

  res.json({ success: true });
});

app.delete('/api/faq', isAuthenticated, isAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM faq WHERE id = ?').run(req.query.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
// 管理 API
// ═══════════════════════════════════════════════════

app.get('/api/admin/users', isAuthenticated, isAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id').all();
  res.json(rows);
});

app.get('/api/admin/logs', isAuthenticated, isAdmin, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows = db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json(rows);
});

app.post('/api/admin/add_user', isAuthenticated, isAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: '用户名已存在' });

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(password + salt).digest('hex');
  db.prepare('INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)')
    .run(username, hash, salt, role || 'user');

  log(req.session.userId, 'add_user', `添加用户: ${username}`);
  res.json({ success: true });
});

app.post('/api/admin/delete_user', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID必填' });

  const db = getDb();
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (id == req.session.userId) return res.status(400).json({ error: '不能删除自己' });

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  log(req.session.userId, 'delete_user', `删除用户: ${user.username}`);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
// DNS-Over-HTTPS API（兼容旧接口）
// ═══════════════════════════════════════════════════

const DOH_SERVERS = [
  'https://dns.alidns.com/resolve',
  'https://doh.pub/dns-query'
];

app.get('/api/doh/resolve', async (req, res) => {
  const { name, type } = req.query;
  if (!name) return res.status(400).json({ error: '域名必填' });
  const qtype = parseInt(type) || 1;

  for (const server of DOH_SERVERS) {
    try {
      const url = `${server}?name=${encodeURIComponent(name)}&type=${qtype}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) return res.json(await response.json());
    } catch (e) { /* try next */ }
  }
  res.status(500).json({ error: 'DNS 解析失败' });
});

// ═══════════════════════════════════════════════════
// 兼容旧路由（返回 error 引导）
// ═══════════════════════════════════════════════════

const DEPRECATED_ROUTES = ['/api/hybrid-search', '/api/upload-multiple', '/api/batch-upload'];
for (const route of DEPRECATED_ROUTES) {
  app.all(route, (req, res) => {
    res.status(410).json({ error: `此接口已废弃。搜索使用 /api/search，上传使用 /api/upload` });
  });
}

// ═══════════════════════════════════════════════════
// 启动服务
// ═══════════════════════════════════════════════════

const PORT = process.env.PORT || 3344;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KB-Web] 服务启动 → http://0.0.0.0:${PORT}`);
    console.log(`[KB-Web] 知识库: ${KB_DIR}`);
    console.log(`[KB-Web] Python: ${KB_PYTHON}`);
    console.log(`[KB-Web] 分类: ${CATEGORIES.join(', ')}`);
  });
}

module.exports = app;
