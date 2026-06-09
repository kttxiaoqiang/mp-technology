const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── FIRST LINE TEST ─────────────────────────────────────────
try {
  const firstTest = '/home/zhang/company_knowledge_base/密码算法对比.xlsx';
  console.log('[FIRST] test1:', firstTest);
  console.log('[FIRST] existsSync:', fs.existsSync(firstTest));
  console.log('[FIRST] openSync:', (() => { try { const fd = fs.openSync(firstTest, 'r'); fs.closeSync(fd); return 'OK'; } catch(e) { return e.code; } })());
  console.log('[FIRST] statSync:', (() => { try { const s = fs.statSync(firstTest); return s.size; } catch(e) { return e.code; } })());
  console.log('[FIRST] lstatSync:', (() => { try { const s = fs.lstatSync(firstTest); return s.size; } catch(e) { return e.code; } })());
  console.log('[FIRST] realpathSync:', (() => { try { return fs.realpathSync(firstTest); } catch(e) { return e.code; } })());
  console.log('[FIRST] accessSync:', (() => { try { fs.accessSync(firstTest, fs.constants.R_OK); return 'OK'; } catch(e) { return e.code; } })());
  console.log('[FIRST] readdir:', (() => { try { return fs.readdirSync('/home/zhang/company_knowledge_base/').filter(x => x.includes('xlsx') || x.includes('密码')).join(', '); } catch(e) { return e.code; } })());
  // Check if we're in a different process state
  console.log('[FIRST] pid:', process.pid, 'ppid:', process.ppid);
  console.log('[FIRST] cwd:', process.cwd());
  // Check module cache
  console.log('[FIRST] module loaded:', module ? 'yes' : 'no');
  // Check mount info
  try {
    const mountInfo = fs.readFileSync('/proc/self/mountinfo', 'utf-8');
    const knowledgeLines = mountInfo.split('\n').filter(l => l.includes('knowledge'));
    console.log('[FIRST] mountinfo (knowledge):', knowledgeLines.length ? knowledgeLines.join(' | ') : 'NONE');
    const totalMounts = mountInfo.split('\n').length;
    console.log('[FIRST] total mounts:', totalMounts);
  } catch(e) { console.log('[FIRST] mountinfo error:', e.message); }
  // Check /home/zhang directory
  console.log('[FIRST] /home/zhang exists:', fs.existsSync('/home/zhang'));
  console.log('[FIRST] /home/zhang/.openclaw exists:', fs.existsSync('/home/zhang/.openclaw'));
  console.log('[FIRST] /home/zhang/company* exists:', fs.readdirSync('/home/zhang/').filter(x => x.includes('company')).join(','));
} catch(e) { console.error('[FIRST] Error:', e.message, e.stack); }

// ─── TOP-LEVEL BOOT TEST (before require) ────────────────────
try {
  const bootTest = '/home/zhang/company_knowledge_base/密评FAQ/密评FAQ指南.pdf';
  console.log(`[BOOT_BEFORE] existsSync("${bootTest}"): ${fs.existsSync(bootTest)}`);
  const test2 = '/home/zhang/company_knowledge_base/密码算法对比.xlsx';
  console.log(`[BOOT_BEFORE] existsSync("${test2}"): ${fs.existsSync(test2)}`);
  const dir = '/home/zhang/company_knowledge_base/密评FAQ/';
  console.log(`[BOOT_BEFORE] readdir("${dir}"): ${fs.existsSync(dir) ? fs.readdirSync(dir).join(', ') : 'DIR NOT FOUND'}`);
  console.log(`[BOOT_BEFORE] cwd: ${process.cwd()}`);
  console.log(`[BOOT_BEFORE] KB_PATH env: ${JSON.stringify(process.env.KB_PATH)}`);
} catch(e) { console.error('[BOOT_BEFORE] Error:', e.message); }

const { autoConvertToMd, toMarkdown, detectCategory } = require('./lib/convert.cjs');
const { extractFaqs, extractFaqsFromChunks } = require('./lib/faq_extract.cjs');

// ─── TOP-LEVEL BOOT TEST (after require) ─────────────────────
try {
  const bootAfter = '/home/zhang/company_knowledge_base/密评FAQ/密评FAQ指南.pdf';
  console.log(`[BOOT_AFTER] existsSync("${bootAfter}"): ${fs.existsSync(bootAfter)}`);
} catch(e) { console.error('[BOOT_AFTER] Error:', e.message); }

const app = express();
const PORT = process.env.PORT || 3344;
const KB_PATH = process.env.KB_PATH || '/home/zhang/company_knowledge_base';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// ─── Multer config ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(KB_PATH)) {
      fs.mkdirSync(KB_PATH, { recursive: true });
    }
    cb(null, KB_PATH);
  },
  filename: (req, file, cb) => {
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const maxLen = 200;
    const safeName = decodedName.length > maxLen
      ? decodedName.substring(0, maxLen) + path.extname(decodedName)
      : decodedName;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, fieldNameSize: 500 }
});

// ─── Middleware ─────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false, lastModified: false }));
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use('/originals', express.static(KB_PATH));

// ─── Session middleware ────────────────────────────────
const session = require('express-session');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const { getDb } = require('./lib/database.cjs');

// Initialize DB
const initDb = () => {
  try {
    const { initTables } = require('./lib/database.cjs');
    initTables();
  } catch(e) {
    console.error('[server] DB init warning:', e.message);
  }
};
initDb();

// ── 测试 Mock: 拦截 DeepSeek API 调用 ──
if (process.env.MOCK_DEEPSEEK === 'true') {
  const originalFetch = global.fetch;
  let mockResponse = process.env.MOCK_DEEPSEEK_RESPONSE || JSON.stringify([
    { question: "测试问题1：密码应用的基本要求是什么？", answer: "测试答案1：根据标准第5章，基本要求包括...", category: "合规要求", source_section: "5 基本要求" },
    { question: "测试问题2：密钥管理有哪些要求？", answer: "测试答案2：根据标准第7章，密钥管理要求包括...", category: "密钥管理", source_section: "7 密钥管理" }
  ]);
  let mockShouldFail = process.env.MOCK_DEEPSEEK_FAIL === 'true';

  global.fetch = async (url, options) => {
    if (url.includes('api.deepseek.com')) {
      if (mockShouldFail) {
        return { ok: false, status: 500, async json() { return { error: 'Mock server error' }; } };
      }
      return {
        ok: true, status: 200,
        async json() { return { choices: [{ message: { content: mockResponse } }] }; }
      };
    }
    return originalFetch(url, options);
  };
  console.log('[mock] DeepSeek API 已拦截 (MOCK_DEEPSEEK=true)');
}

app.use(session({
  store: new SQLiteStore({
    client: getDb(),
    expired: {
      clear: true,
      intervalMs: 900000 // 15 min cleanup
    }
  }),
  secret: 'kb-web-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24h
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ─── Auth routes ──────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    const bcrypt = require('bcryptjs');
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    // 检查用户是否被禁用
    if (user.status === 'disabled') {
      return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    // 更新 last_login 并记录日志
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    db.prepare('INSERT INTO logs (user_id, username, action, detail, ip_address) VALUES (?, ?, ?, ?, ?)').run(user.id, user.username, 'login', '用户登录', ip);
    return res.json({ success: true, user: { username: user.username, role: user.role } });
  } catch (err) {
    console.error('[login] Error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const db = getDb();
  if (req.session && req.session.userId) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    db.prepare('INSERT INTO logs (user_id, username, action, detail, ip_address) VALUES (?, ?, ?, ?, ?)').run(req.session.userId, req.session.username, 'logout', '用户登出', ip);
  }
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: '未登录' });
    const { oldPassword, newPassword } = req.body;
    const bcrypt = require('bcryptjs');
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: '原密码错误' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.userId);
    return res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    console.error('[change-password] Error:', err);
    return res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const db = getDb();
  if (req.session && req.session.userId) {
    const user = db.prepare('SELECT username, role, status, avatar FROM users WHERE id = ?').get(req.session.userId);
    if (user) return res.json({ user: { username: user.username, role: user.role, status: user.status, avatar: user.avatar } });
    return res.json({ user: { username: req.session.username, role: req.session.role } });
  }
  return res.json({ user: null });
});

// ─── GET /api/auth/avatar ───────────────────────────
app.get('/api/auth/avatar', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: '未登录' });
  const db = getDb();
  const user = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.session.userId);
  if (user && user.avatar) return res.json({ avatar: user.avatar });
  return res.json({ avatar: null });
});

// ─── POST /api/auth/avatar (上传头像) ───────────────
app.post('/api/auth/avatar', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: '未登录' });
  upload.single('avatar')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: '文件上传失败' });
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    try {
      const fs = require('fs');
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
      db.prepare('INSERT INTO logs (user_id, username, action, detail, ip_address) VALUES (?, ?, ?, ?, ?)')
        .run(req.session.userId, req.session.username, 'avatar_upload', '上传头像', ip);
      return res.json({ success: true, avatar: base64 });
    } catch (e) {
      return res.status(500).json({ error: '处理图片失败' });
    }
  });
});

// ─── Test mode setup (NODE_ENV=test only) ────────────
if (process.env.NODE_ENV === 'test') {
  const bcrypt = require('bcryptjs');
  app.post('/api/test/setup-session', (req, res) => {
    const { role } = req.body || {};
    const r = role === 'engineer' ? 'engineer' : 'admin';
    // Find or create a test user
    const db = getDb();
    let user = db.prepare('SELECT * FROM users WHERE username = ?').get('test' + r);
    if (!user) {
      const hash = bcrypt.hashSync('testpass123', 10);
      db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('test' + r, hash, r);
      user = db.prepare('SELECT * FROM users WHERE username = ?').get('test' + r);
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    return res.json({ success: true, user: { username: user.username, role: user.role } });
  });

  // Test-only: cleanup test files
  app.post('/api/test/cleanup', (req, res) => {
    const KB_PATH = process.env.KB_PATH || '/home/zhang/company_knowledge_base';
    const scanDir = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (lower.startsWith('test_') || lower.startsWith('e2e_') || lower.startsWith('中文')) {
            try { fs.unlinkSync(fullPath); } catch {}
            const ext = path.extname(fullPath);
            if (ext !== '.md') {
              try { fs.unlinkSync(fullPath.replace(ext, '.md')); } catch {}
            }
          }
        }
      }
    };
    scanDir(KB_PATH);
    res.json({ success: true });
  });

  console.log('[server] Test mode routes enabled');
}

// ─── Scan files ─────────────────────────────────────────────────
// ─── Boot: ensure KB_PATH directory exists ────────────────────
// Explicitly ensure category subdirectories exist at startup
const CATEGORIES = ['方案', '报告', '密评FAQ', '标准规范', '法规政策', '参考文档', '其他'];
for (const cat of CATEGORIES) {
  const catDir = path.join(KB_PATH, cat);
  if (!fs.existsSync(catDir)) {
    try { fs.mkdirSync(catDir, { recursive: true }); } catch(e) {}
  }
}

// Shared file cache (refreshed per request)
let _allFilesCache = [];
let _mdFileMapCache = null;

function refreshFileCache() {
  _allFilesCache = scanFiles(KB_PATH);
  _mdFileMapCache = null; // invalidate
}

function getMdFileMap() {
  if (_mdFileMapCache) return _mdFileMapCache;
  if (_allFilesCache.length === 0) refreshFileCache();
  const _map_xxx = new Map();
  const nonMdFiles = _allFilesCache.filter(f => !f.name.toLowerCase().endsWith('.md'));
  const mdFiles = _allFilesCache.filter(f => f.name.toLowerCase().endsWith('.md'));
  for (const md of mdFiles) {
    try {
      const content = fs.readFileSync(md.path, 'utf-8');
      const meta = parseYamlFrontMatter(content);
      let matchedOrig = '';
      if (meta.source) {
        for (const f of nonMdFiles) {
          if (f.relativePath === meta.source || f.relativePath.endsWith('/' + meta.source) || f.name === meta.source || f.path === meta.source) {
            matchedOrig = f.relativePath;
            break;
          }
        }
      }
      if (!matchedOrig) {
        const stem = path.basename(md.name, '.md');
        for (const f of nonMdFiles) {
          const fStem = path.basename(f.name).replace(path.extname(f.name), '');
          if (fStem === stem) {
            matchedOrig = f.relativePath;
            break;
          }
        }
      }
      if (matchedOrig) _map_xxx.set(md.path, matchedOrig);
    } catch (e) { /* skip */ }
  }
  _mdFileMapCache = _map_xxx;
  return _map_xxx;
}

// Get the original file extension for display purposes
// For .md files, check if there's a same-name non-.md sibling; also check YAML source_type
// ─── Recursively resolve a filename to its full path within KB ───
function resolveFileInKB(filename) {
  const walk = function(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch(e) { return null; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(fullPath);
        if (found) return found;
      } else if (entry.name === filename) {
        return fullPath;
      }
    }
    return null;
  };
  return walk(KB_PATH);
}

function countExtractedImages(filePath, name) {
  try {
    const ext = path.extname(name).toLowerCase();
    if (ext !== '.docx') return 0;
    const dir = path.dirname(filePath);
    const imagesDir = path.join(dir, '_images');
    if (!fs.existsSync(imagesDir)) return 0;
    const stem = path.basename(name, ext);
    const files = fs.readdirSync(imagesDir);
    return files.filter(f => f.startsWith(stem + '_')).length;
  } catch (e) { return 0; }
}

function getOriginalExt(name, fullPath) {
  const stem = path.basename(name, path.extname(name));
  const dir = path.dirname(fullPath);
  let ext = path.extname(name).toLowerCase();

  // If this is a .md file, look for a sibling with same stem but different ext
  // e.g. 连云港.pdf → 连云港.md → show PDF icon
  if (ext === '.md') {
    try {
      const entries = fs.readdirSync(dir);
      for (const e of entries) {
        if (e.startsWith(stem + '.') && e !== name) {
          const siblingExt = path.extname(e).toLowerCase();
          if (siblingExt && siblingExt !== '.md') {
            return siblingExt.slice(1).toUpperCase(); // 'pdf' → 'PDF'
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (ext.startsWith('.')) ext = ext.slice(1);
  return ext.toUpperCase();
}

function scanFiles(dir, relativePath = '') {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      // 跳过 _files 和 _images 目录（这些是文档提取的图片目录，不是独立的知识库内容）
      // 跳过 _files、_images 以及 xxx_files 目录（文档提取图片目录）
      if (entry.name === '_images' || entry.name.endsWith('_files')) continue;
      const subResults = scanFiles(fullPath, path.join(relativePath, entry.name));
      results.push(...subResults);
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      const name = entry.name;
      const relForFile = path.join(relativePath, entry.name);
      results.push({
        id: '',
        name,
        original_name: name,
        path: fullPath,
        relativePath: relForFile,
        size: stat.size,
        file_size: stat.size,
        mtime: stat.mtime.toISOString(),
        created_at: stat.mtime.toISOString(),
        dir: relativePath || null,
        category: relativePath || '根目录',
        downloadPath: `/api/download/${encodeURIComponent(relForFile)}`,
        isHtml: /\.html?$/i.test(name) ? true : false,
        original_ext: getOriginalExt(entry.name, fullPath),
        image_count: countExtractedImages(fullPath, name)
      });
    }
  }
  return results;
}

// ─── Parse YAML front-matter ───────────────────────────────────
function parseYamlFrontMatter(content) {
  const result = { title: '', source: '', source_type: '', created: '' };
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return result;
  const yaml = match[1];
  for (const line of yaml.split('\n')) {
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const key = line.substring(0, sep).trim();
    const val = line.substring(sep + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key === 'title') result.title = val;
    else if (key === 'source') result.source = val;
    else if (key === 'source_type') result.source_type = val;
    else if (key === 'created') result.created = val;
  }
  return result;
}

// ─── Search only .md files, return with source info ────────────
function searchMdFiles(query, maxResults = 20, category) {
  refreshFileCache();
  const mdFileMap = getMdFileMap();
  const queryLower = query.toLowerCase().trim();
  const results = [];
  const mdFiles = _allFilesCache.filter(f => f.name.toLowerCase().endsWith('.md') && (!category || f.category === category || f.dir === category));

  // Split query into individual keywords (space-separated)
  let rawKeywords = queryLower.split(/\s+/).filter(k => k.length > 0);
  // Preserve the first raw keyword for weighted boosting
  const firstRawKeyword = rawKeywords.length > 0 ? rawKeywords[0] : null;

  // If query has no spaces and total length >= 4 with some Chinese chars,
  // try to split into overlapping substrings for better coverage
  if (rawKeywords.length < 2 && queryLower.length >= 4) {
    const chineseCount = (queryLower.match(/[\u4e00-\u9fff]/g) || []).length;
    if (chineseCount > 0) {
      // Split into overlapping substrings of length 2-4
      // Keep the full query too
      const grams = new Set();
      const maxLen = Math.min(queryLower.length, 4);
      for (const len of [4, 3, 2]) {
        if (len > queryLower.length) continue;
        for (let i = 0; i <= queryLower.length - len; i++) {
          grams.add(queryLower.substring(i, i + len));
        }
      }
      const newKeywords = [...grams];
      if (newKeywords.length > 0) {
        rawKeywords = newKeywords;
      }
    }
  }

  const validKeywords = rawKeywords.filter(k => k.length >= 1);
  const totalKeywords = Math.max(1, validKeywords.length);

  for (const file of mdFiles) {
    try {
      const stats = fs.statSync(file.path);
      if (stats.size > 5 * 1024 * 1024) continue;
      const content = fs.readFileSync(file.path, 'utf-8');

      // Strip YAML front matter first
      const contentNoYaml = content.replace(/^---[\s\S]*?\n---\n/, '');
      const contentNoYamlLower = contentNoYaml.toLowerCase();

      // Filename match
      const nameMatch = file.name.toLowerCase().includes(queryLower);

      // ---- Find best snippet region and count matches within it ----
      let snippet = '';
      let snippetMatchCount = 0;
      let snippetMatchedKeywords = [];

      if (totalKeywords >= 2) {
        // Collect positions of ALL keyword occurrences in file
        const allPositions = [];  // [{kw, pos}]
        for (const kw of validKeywords) {
          let pos = -1;
          while ((pos = contentNoYamlLower.indexOf(kw, pos + 1)) >= 0) {
            allPositions.push({ kw, pos });
          }
        }
        allPositions.sort((a, b) => a.pos - b.pos);

        const uniqueKwInFile = new Set(allPositions.map(p => p.kw));
        if (uniqueKwInFile.size > 0) {
          const WINDOW = 150;
          let bestStart = 0, bestEnd = 0, bestCount = 0;

          for (let i = 0; i < allPositions.length; i++) {
            const winStart = Math.max(0, allPositions[i].pos - 60);
            const winEnd = Math.min(contentNoYamlLower.length, allPositions[i].pos + WINDOW);
            const region = contentNoYamlLower.substring(winStart, winEnd);
            let cnt = 0;
            for (const kw of validKeywords) {
              if (region.includes(kw)) cnt++;
            }
            // Prefer window with more keyword matches; tie-break: larger count of keyword tokens visible in snippet, then more central position
            if (cnt > bestCount) {
              bestCount = cnt;
              bestStart = winStart;
              bestEnd = winEnd;
            } else if (cnt === bestCount && cnt > 0) {
              // Tie-break: prefer window where more actual keyword text occurrences are visible
              // Count how many different keywords actually appear (not just match count)
              const visibleKeywords = new Set();
              for (const kw of validKeywords) {
                if (region.includes(kw)) visibleKeywords.add(kw);
              }
              const currBestRegion = contentNoYamlLower.substring(bestStart, bestEnd);
              const bestVisibleKeywords = new Set();
              for (const kw of validKeywords) {
                if (currBestRegion.includes(kw)) bestVisibleKeywords.add(kw);
              }
              if (visibleKeywords.size > bestVisibleKeywords.size) {
                bestStart = winStart;
                bestEnd = winEnd;
              } else if (visibleKeywords.size === bestVisibleKeywords.size) {
                // Same visible set: prefer more central position
                const currMid = (bestStart + bestEnd) / 2;
                const newMid = (winStart + winEnd) / 2;
                const contentMid = contentNoYamlLower.length / 2;
                if (Math.abs(newMid - contentMid) < Math.abs(currMid - contentMid)) {
                  bestStart = winStart;
                  bestEnd = winEnd;
                }
              }
            }
          }

          if (bestCount > 0) {
            snippetMatchCount = bestCount;
            const bestRegion = contentNoYamlLower.substring(bestStart, bestEnd);
            for (const kw of validKeywords) {
              if (bestRegion.includes(kw)) {
                snippetMatchedKeywords.push(kw);
              }
            }

            snippet = contentNoYaml.substring(bestStart, bestEnd);
            // Trim to clean line boundaries but DON'T clip out matched keywords
            // First, try clean boundaries at newlines
            const firstNewline = snippet.indexOf('\n');
            if (firstNewline >= 0 && firstNewline < 50) {
              // Only trim leading newline if no match before it
              const prefixMatch = snippetMatchedKeywords.some(kw => snippet.substring(0, firstNewline).toLowerCase().includes(kw));
              if (!prefixMatch) snippet = snippet.substring(firstNewline + 1);
            }
            // Extend trailing boundary instead of clipping, to keep keywords visible
            // Find the last keyword position in snippet and ensure it's not near the cut
            const lastKwEnd = snippetMatchedKeywords.reduce((maxEnd, kw) => {
              const pos = snippet.toLowerCase().lastIndexOf(kw);
              return pos >= 0 ? Math.max(maxEnd, pos + kw.length) : maxEnd;
            }, 0);
            if (lastKwEnd > 0 && snippet.length - lastKwEnd < 30) {
              // Extend original content to include more context after last keyword
              const extra = Math.max(60, snippet.length - lastKwEnd + 30);
              const extendedEnd = Math.min(contentNoYaml.length, bestEnd + extra);
              snippet = contentNoYaml.substring(bestStart, extendedEnd);
            }
          }
        }
      } else {
        // Single keyword: simple search
        const firstPos = contentNoYamlLower.indexOf(queryLower);
        if (firstPos >= 0) {
          snippetMatchCount = 1;
          snippetMatchedKeywords = [queryLower];
          const start = Math.max(0, firstPos - 60);
          const end = Math.min(contentNoYaml.length, firstPos + 150);
          snippet = contentNoYaml.substring(start, end);
          const firstNewline = snippet.indexOf('\n');
          if (firstNewline >= 0 && firstNewline < 50) {
            snippet = snippet.substring(firstNewline + 1);
          }
          // Don't clip trailing keywords
          const lastKwPos = snippet.toLowerCase().lastIndexOf(queryLower);
          if (lastKwPos >= 0 && snippet.length - lastKwPos - queryLower.length < 30) {
            const extra = Math.max(60, snippet.length - (lastKwPos + queryLower.length) + 30);
            const extendedEnd = Math.min(contentNoYaml.length, end + extra);
            snippet = contentNoYaml.substring(start, extendedEnd);
          }
        }
      }

      // ---- Score based on snippet region only ----
      if (snippetMatchCount > 0 || nameMatch) {
        const meta = parseYamlFrontMatter(content);

        let score;
        if (snippetMatchCount > 0 && totalKeywords >= 2) {
          score = snippetMatchCount / totalKeywords;
          // Bonus for full-ish match
          if (snippetMatchCount >= 2 && totalKeywords >= 2) {
            score = Math.min(1, score + 0.15);
          }
          // First keyword boost: if the first keyword from raw split is matched,
          // boost score since it represents the primary search intent
          if (score < 1.0 && validKeywords.length > 0 && snippet && snippetMatchCount > 0) {
            const firstSubword = validKeywords[0];
            if (snippet.toLowerCase().includes(firstSubword)) {
              // Check it wasn't already counted (it should be count included)
              score = Math.min(1.0, score + 0.2);
            }
          }
        } else if (snippetMatchCount > 0) {
          score = 1.0;
        } else {
          score = 0.3;
        }

        score = Math.round(score * 100) / 100;

        const methodDesc = (snippetMatchCount >= totalKeywords)
          ? '全文匹配（全匹配）'
          : (snippetMatchCount > 0
            ? '全文匹配（部分匹配 ' + snippetMatchCount + '/' + totalKeywords + '）'
            : '文件名匹配');

        // ---- Highlight matched keywords in snippet ----
        if (snippet && snippetMatchedKeywords.length > 0) {
          let tmpSnippet = snippet;
          const highlights = [];
          for (const kw of snippetMatchedKeywords) {
            let pos = 0;
            while ((pos = tmpSnippet.toLowerCase().indexOf(kw, pos)) >= 0) {
              highlights.push({ start: pos, end: pos + kw.length });
              pos += kw.length;
            }
          }
          highlights.sort((a, b) => a.start - b.start);
          const merged = [];
          for (const h of highlights) {
            if (merged.length > 0 && h.start <= merged[merged.length - 1].end) {
              merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, h.end);
            } else {
              merged.push({ ...h });
            }
          }
          for (let i = merged.length - 1; i >= 0; i--) {
            const { start, end } = merged[i];
            snippet = snippet.substring(0, start) + '【' + snippet.substring(start, end) + '】' + snippet.substring(end);
          }
        } else if (nameMatch) {
          snippet = '[文件名匹配]';
        }

        const originalName = meta.source || '';
        let originalIsSeparate = false;
        if (originalName) {
          if (path.isAbsolute(originalName)) {
            originalIsSeparate = fs.existsSync(originalName);
          } else {
            const mdDir = path.dirname(file.path);
            originalIsSeparate = fs.existsSync(path.join(mdDir, originalName)) ||
              fs.existsSync(path.join(KB_PATH, originalName));
          }
        }

        results.push({
          id: '',
          title: file.name,
          original_name: file.name,
          name: file.name,
          path: file.path,
          relativePath: file.relativePath,
          size: stats.size,
          file_size: stats.size,
          dir: file.dir,
          category: file.dir || '根目录',
          mtime: stats.mtime.toISOString(),
          created_at: stats.mtime.toISOString(),
          snippet: snippet.trim(),
          method: methodDesc,
          score: score,
          original_ext: file.original_ext || '',
          originalFile: originalIsSeparate ? originalName : '',
          originalDownloadPath: originalIsSeparate ? (path.isAbsolute(originalName) ? '/api/download/' + encodeURIComponent(path.relative(KB_PATH, originalName)) : '/api/download/' + encodeURIComponent(originalName)) : ''
        });
      }
    } catch (e) {
      // skip unreadable
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer results where snippet actually contains highlighted keywords
    const aHasSnippet = a.snippet && a.snippet.includes('【');
    const bHasSnippet = b.snippet && b.snippet.includes('【');
    if (bHasSnippet !== aHasSnippet) return bHasSnippet ? 1 : -1;
    // Shorter files tend to be more relevant
    return a.size - b.size;
  });
  return results.slice(0, maxResults);
}

// ─── GET /api/files ────────────────────────────────────────────
app.get('/api/files', (req, res) => {
  try {
    const files = scanFiles(KB_PATH);
    const categoryFilter = (req.query.category || '').trim().replace('其他', '根目录');
    const filtered = categoryFilter
      ? files.filter(f => (f.dir === categoryFilter || f.category === categoryFilter))
      : files;
    const groups = {};
    for (const f of filtered) {
      const group = f.dir || '根目录';
      if (!groups[group]) groups[group] = [];
      groups[group].push(f);
    }
    res.json({ count: filtered.length, files: filtered, groups });
  } catch (err) {
    console.error('[files] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/check-file-exists ──────────────────────────────
// 上传前检查文件是否已存在
app.get('/api/check-file-exists', (req, res) => {
  const fileName = req.query.name;
  if (!fileName) return res.json({ exists: false });
  const category = detectCategory(fileName);
  const searchDir = category !== '其他' ? path.join(KB_PATH, category) : KB_PATH;
  const filePath = path.join(searchDir, fileName);
  res.json({ exists: fs.existsSync(filePath), filename: fileName, category });
});

// ─── POST /api/upload (single file) ────────────────────────────
app.post('/api/upload', (req, res) => {
  // 处理冲突策略参数
  // 前端传入 conflict: 'overwrite' (默认) | 'skip' | 'rename' | 'prompt'
  // prompt 模式：先检查，由前端决定
  const conflict = req.body.conflict || 'overwrite';
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const originalPath = req.file.path;
    const filename = path.basename(originalPath);
    const origName = Buffer.from(req.file.originalname || filename, 'latin1').toString('utf8');

    try {
      const category = detectCategory(origName);
      const categoryDir = category !== '其他' ? path.join(KB_PATH, category) : KB_PATH;
      if (category !== '其他' && !fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

      // 检查目标文件是否已存在
      const destPath = path.join(categoryDir, origName);
      const existsFlag = fs.existsSync(destPath);

      if (existsFlag) {
        if (conflict === 'skip') {
          // 跳过：删除临时文件，返回已存在信息
          try { fs.unlinkSync(originalPath); } catch {}
          return res.json({ success: true, skipped: true, filename: origName, message: '文件已存在，已跳过' });
        }
        if (conflict === 'rename') {
          // 重命名：加时间戳
          const ext = path.extname(origName);
          const base = path.basename(origName, ext);
          const ts = new Date().toISOString().slice(0,19).replace(/[T:-]/g,'');
          const newName = base + '_' + ts + ext;
          const renamePath = path.join(categoryDir, newName);
          fs.renameSync(originalPath, renamePath);
          // 对新文件名继续处理
          const mdPath = await autoConvertToMd(renamePath);
          logActionInternal('upload', origName + ' → ' + newName + ' (custom rename)');
          const shouldExtract = /faq/i.test(newName) && DEEPSEEK_API_KEY;
          return res.json({ success: true, renamed: true, filename: newName, originalFilename: origName, mdPath, extractionStatus: shouldExtract ? 'pending' : 'skipped' });
        }
        // overwrite: 先删除旧文件
        try { fs.unlinkSync(destPath); } catch {}
      }

      let movedPath = originalPath;
      if (category !== '其他') {
        fs.renameSync(originalPath, destPath);
        movedPath = destPath;
      }
      const mdPath = await autoConvertToMd(movedPath);

      // ── 异步 FAQ 抽取 ──
      // 仅文件名包含 "FAQ"（不区分大小写）的文件才自动抽取
      const shouldExtract = /faq/i.test(path.basename(movedPath)) && DEEPSEEK_API_KEY;
      const extractionStatus = shouldExtract ? 'pending' : 'skipped';

      if (shouldExtract) {
        setImmediate(async () => {
          try {
            // 确定要抽取的 .md 文件路径
            const targetMdPath = mdPath || movedPath;
            if (!targetMdPath.endsWith('.md')) {
              console.log('[auto-extract] Skipped: no markdown file for', filename);
              return;
            }

            // 读取并去掉 YAML front-matter
            let mdContent = fs.readFileSync(targetMdPath, 'utf-8');
            mdContent = mdContent.replace(/^---[\s\S]*?---\n*/, '').trim();

            if (!mdContent) {
              console.log('[auto-extract] Skipped: empty content from', filename);
              return;
            }
            // 密评FAQ 类型文件要完整抽取每个问答对，不截断

            const isFaqCategory = (category === '密评FAQ');
            let allFaqs = [];

            if (isFaqCategory) {
              console.log('[auto-extract] 密评FAQ 类型，分块完整抽取');
              allFaqs = await extractFaqsFromChunks(mdContent, {
                apiKey: DEEPSEEK_API_KEY,
                chunkSize: 5000,
                overlap: 300,
                maxPairsPerChunk: 30,
                maxTokensPerChunk: 8192
              });
            } else {
              if (mdContent.length > 6000) {
                console.log('[auto-extract] 文档过长，截取前 6000 字符');
                mdContent = mdContent.slice(0, 6000);
              }
              if (!mdContent) {
                console.log('[auto-extract] Skipped: empty content from', filename);
                return;
              }
              allFaqs = await extractFaqs(mdContent, {
                apiKey: DEEPSEEK_API_KEY,
                maxPairs: 10,
                maxTokens: 2048
              });
            }

            // 去重
            const seen = new Set();
            const deduped = allFaqs.filter(f => {
              const key = f.question.trim().substring(0, 25);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });

            if (deduped.length === 0) {
              console.log('[auto-extract] Empty result from', filename);
              logActionInternal('faq_auto_extract', path.basename(targetMdPath) + ': 空结果');
              return;
            }

            // 清除旧的自动抽取记录
            const sourceFileName = path.basename(targetMdPath);
            const { getDb } = require('./lib/database.cjs');
            const db = getDb();
            db.prepare('DELETE FROM faq WHERE source_file = ? AND extracted = 1').run(sourceFileName);

            // 写入 faq 表
            const insert = db.prepare(
              'INSERT INTO faq (question, answer, category, source_file, source_section, extracted) VALUES (?, ?, ?, ?, ?, 1)'
            );
            const insertMany = db.transaction((items) => {
              for (const item of items) {
                insert.run(item.question, item.answer, item.category || '其他', sourceFileName, item.source_section || '');
              }
            });
            insertMany(deduped);

            logActionInternal('faq_auto_extract', '从\u300c' + sourceFileName + '\u300d自动抽取 ' + deduped.length + ' 条 FAQ');
            console.log('[auto-extract] OK:', filename, '\u2192', deduped.length, 'FAQs');
          } catch (e) {
            console.error(`[auto-extract] Error for ${filename}:`, e.message);
            logActionInternal('faq_auto_extract', `从「${filename}」自动抽取失败: ${e.message}`);
          }
        });
      }

      const relPath = path.relative(KB_PATH, movedPath);
      logAction(req, 'upload', { filename, category, size: req.file.size });
      res.json({
        success: true,
        file: { name: filename, size: req.file.size, path: movedPath, category, downloadPath: `/api/download/${encodeURIComponent(relPath)}` },
        convertedToMd: !!mdPath,
        mdFile: mdPath ? path.basename(mdPath) : null,
        extraction_status: extractionStatus
      });
    } catch (err) {
      console.error(`[upload] Error:`, err);
      const errRelPath = path.relative(KB_PATH, originalPath);
      res.json({
        success: true,
        file: { name: filename, size: req.file.size, path: originalPath, category: '其他', downloadPath: `/api/download/${encodeURIComponent(errRelPath)}` },
        warning: err.message
      });
    }
  });
});

// ─── POST /api/upload-multiple ─────────────────────────────────
app.post('/api/upload-multiple', (req, res) => {
  upload.array('files')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }
    const results = [];
    for (const file of req.files) {
      const filename = path.basename(file.path);
      const category = detectCategory(filename);
      let movedPath = file.path;
      if (category !== '其他') {
        const categoryDir = path.join(KB_PATH, category);
        if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });
        const destPath = path.join(categoryDir, filename);
        fs.renameSync(file.path, destPath);
        movedPath = destPath;
      }
      let mdPath = null;
      try { mdPath = await autoConvertToMd(movedPath); } catch (e) { /* ignore */ }
      const relPath = path.relative(KB_PATH, movedPath);
      results.push({
        name: filename, size: file.size, category,
        downloadPath: `/api/download/${encodeURIComponent(relPath)}`,
        converted: !!mdPath, mdFile: mdPath ? path.basename(mdPath) : null
      });
    }
    logAction(req, 'upload', { count: req.files.length, files: results.map(r => r.name) });
    setImmediate(() => triggerQmdUpdate());
    res.json({ success: true, files: results, count: results.length });
  });
});

// ─── POST /api/upload-batch (directory upload) ─────────────────
app.post('/api/upload-batch', async (req, res) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ success: false, error: 'dirPath required' });
    if (!fs.existsSync(dirPath)) return res.status(400).json({ success: false, error: `目录不存在: ${dirPath}` });
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ success: false, error: '路径不是目录' });

    // 递归收集所有文件
    const allFiles = [];
    function walkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          allFiles.push(fullPath);
        }
      }
    }
    walkDir(dirPath);

    const total = allFiles.length;
    const results = [];
    let successCount = 0, failCount = 0;

    for (let i = 0; i < total; i++) {
      const sourcePath = allFiles[i];
      const filename = path.basename(sourcePath);
      try {
        const category = detectCategory(filename);
        let targetDir = KB_PATH;
        if (category !== '其他') {
          targetDir = path.join(KB_PATH, category);
        }
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const destPath = path.join(targetDir, filename);

        // 如果目标已存在，添加序号前缀
        let finalDest = destPath;
        let counter = 1;
        while (fs.existsSync(finalDest)) {
          const ext = path.extname(filename);
          const base = filename.slice(0, -ext.length);
          finalDest = path.join(targetDir, `${base}_${counter}${ext}`);
          counter++;
        }

        fs.copyFileSync(sourcePath, finalDest);
        const { size } = fs.statSync(finalDest);

        let mdPath = null;
        try { mdPath = await autoConvertToMd(finalDest); } catch (e) { /* ignore convert error */ }

        const relPath = path.relative(KB_PATH, finalDest);
        results.push({
          name: path.basename(finalDest),
          sourceName: filename,
          size,
          category,
          downloadPath: `/api/download/${encodeURIComponent(relPath)}`,
          converted: !!mdPath,
          mdFile: mdPath ? path.basename(mdPath) : null
        });
        successCount++;
      } catch (err) {
        console.error(`[upload-batch] 失败: ${sourcePath}`, err.message);
        results.push({ sourceName: filename, name: filename, error: err.message });
        failCount++;
      }
    }

    logAction(req, 'upload', { type: 'batch', source: dirPath, total, success: successCount, fail: failCount });
    res.json({ success: true, files: results, count: results.length, successCount, failCount });
  } catch (err) {
    console.error('[upload-batch] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/upload-text ─────────────────────────────────────
app.post('/api/upload-text', (req, res) => {
  try {
    const { filename, content } = req.body;
    if (!filename || !content) return res.status(400).json({ error: 'filename and content required' });
    const safeName = path.basename(filename);
    const mdFilename = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
    const category = detectCategory(safeName);
    let targetDir = KB_PATH;
    if (category !== '其他') {
      targetDir = path.join(KB_PATH, category);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(path.join(targetDir, mdFilename), content, 'utf-8');
    res.json({ success: true, file: { name: mdFilename, path: path.join(targetDir, mdFilename), category } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/search (full-text search on .md files only) ──────
app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.json({ count: 0, query: '', results: [] });
  // Log search query for hot-searches stats (DB)
  try {
    const { logSearch } = require('./lib/database.cjs');
    logSearch(query.toLowerCase().slice(0, 100));
  } catch(e) { /* silent */ }

  try {
    const maxResults = parseInt(req.query.limit) || 20;
    const category = (req.query.category || '').trim();
    const results = [];
    const seen = new Set();

    // Phase 1: QMD BM25 search (fast, no GPU needed)
    try {
      const { execSync } = require('child_process');
      // Resolve qmd path dynamically, try PATH first
      const qmdPath = (() => { try { return require('child_process').execSync('which qmd', {encoding:'utf-8'}).trim(); } catch(e) { return ''; } })();
      const qmdResolved = qmdPath && fs.existsSync(qmdPath) ? qmdPath : '';
      if (qmdResolved) {
        const collectionName = path.basename(KB_PATH);
        // Use 'qmd search' (pure BM25, ~3-5s) instead of 'qmd query' (LLM rerank, ~60s+)
        const cmd = `${qmdResolved} search "${query.replace(/"/g, '\\"')}" -c "${collectionName}" -n 10 2>/dev/null`;
        const qmdOutput = execSync(cmd, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }).toString().trim();
        if (qmdOutput && qmdOutput.length > 0) {
          // qmd search outputs multi-line records:
          //   qmd://collection/file.md #hash\n  Title: ...\n  Score:  N%\n\n  @@ diff
          const lines = qmdOutput.split('\n');
          let qmdUri = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('qmd://')) {
              qmdUri = trimmed.split(' ')[0].replace('qmd://', '');
            } else if (trimmed.startsWith('Score:')) {
              if (qmdUri) {
                const qmdFileName = qmdUri.includes('/') ? qmdUri.split('/').pop() : qmdUri;
                let mdFileName = qmdFileName;
                if (!mdFileName.toLowerCase().endsWith('.md')) {
                  const ext = path.extname(mdFileName);
                  mdFileName = mdFileName.replace(ext, '.md');
                }
                const mdPath = findMdFile(mdFileName);
                if (mdPath && !seen.has(mdPath)) {
                  const relPath = path.relative(KB_PATH, mdPath);
                  const stat = fs.statSync(mdPath);
                  const content = fs.readFileSync(mdPath, 'utf-8');
                  const meta = parseYamlFrontMatter(content);

                  let originalSrc = '';
                  if (meta.source) {
                    const candidates = [];
                    if (path.isAbsolute(meta.source)) {
                      candidates.push(meta.source);
                    } else {
                      candidates.push(path.join(KB_PATH, meta.source));
                      candidates.push(path.dirname(mdPath) !== KB_PATH ? path.join(path.dirname(mdPath), path.basename(meta.source)) : null);
                      candidates.push(path.join(KB_PATH, path.basename(meta.source)));
                    }
                    for (const c of candidates) {
                      if (c && fs.existsSync(c)) {
                        originalSrc = path.relative(KB_PATH, c);
                        break;
                      }
                    }
                  }

                  const score = parseInt(trimmed.replace('Score:', '').replace('%', '').trim()) / 100;

                  results.push({
                    id: '',
                    title: path.basename(mdPath),
                    original_name: path.basename(mdPath),
                    name: path.basename(mdPath),
                    path: mdPath,
                    relativePath: relPath,
                    size: stat.size,
                    file_size: stat.size,
                    mtime: stat.mtime.toISOString(),
                    created_at: stat.mtime.toISOString(),
                    dir: path.dirname(relPath) !== '.' ? path.dirname(relPath) : null,
                    category: path.dirname(relPath) !== '.' ? path.dirname(relPath) : '根目录',
                    snippet: extractSnippet(content, query),
                    method: '语义检索',
                    score: score,
                    original_ext: (() => {
                      const p = require('path');
                      const KB = '/home/zhang/company_knowledge_base';
                      const getExt = (n, fp) => {
                        const stem = p.basename(n, p.extname(n));
                        const dir = p.dirname(fp);
                        try {
                          const entries = require('fs').readdirSync(dir);
                          for (const e of entries) {
                            if (e.startsWith(stem + '.') && e !== n) {
                              const se = p.extname(e).toLowerCase();
                              if (se && se !== '.md') return se.slice(1).toUpperCase();
                            }
                          }
                        } catch(e) {}
                        return 'MD';
                      };
                      return meta.source && require('fs').existsSync(meta.source) ? getExt(path.basename(meta.source), meta.source) : getExt(mdFileName, mdPath);
                    })(),
                    originalDownloadPath: originalSrc ? '/api/download/' + encodeURIComponent(originalSrc) : ''
                  });
                  seen.add(mdPath);
                }
                qmdUri = '';
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[search] qmd error, falling back:', e.message);
    }


    // Phase 2: Full-text fallback to cover more results
    const ftResults = searchMdFiles(query, maxResults, category);
    for (const r of ftResults) {
      if (!seen.has(r.path)) {
        results.push(r);
        seen.add(r.path);
      }
    }

    // Phase 3: Match non-.html file names (so users can find HTML files by name)
    try {
      const queryLower = query.toLowerCase().trim();
      if (queryLower) {
        const allFiles = scanFiles(KB_PATH);
        for (const f of allFiles) {
          if (seen.has(f.path) || f.relativePath.endsWith('.md')) continue;
          if (f.name.toLowerCase().includes(queryLower)) {
            f.snippet = '[文件名匹配]';
            f.method = '文件名匹配';
            f.score = 0.5;
            f.title = f.name;
            f.original_name = f.name;
            f.originalDownloadPath = f.downloadPath || '';
            f.originalFile = f.original_name;
            results.push(f);
            seen.add(f.path);
          }
        }
      }
    } catch (e) { /* silent */ }

    results.sort((a, b) => b.score - a.score);
    const sliced = results.slice(0, maxResults);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ count: sliced.length, query, results: sliced, type: 'hybrid_search' });
  } catch (err) {
    console.error('[search] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/hybrid-search (semantic + full-text on .md only) ─
app.get('/api/hybrid-search', (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.json({ count: 0, query: '', results: [] });

  try {
    const maxResults = parseInt(req.query.limit) || 20;
    const results = [];
    const seen = new Set();

    // Phase 1: QMD BM25 search (only returns .md files)
    try {
      const { execSync } = require('child_process');
      const qmdPath = (() => { try { return require('child_process').execSync('which qmd', {encoding:'utf-8'}).trim(); } catch(e) { return ''; } })();
      const qmdResolved = qmdPath && fs.existsSync(qmdPath) ? qmdPath : '';
      if (qmdResolved) {
        const qmdCollectionName = path.basename(KB_PATH);
        const cmd = `${qmdResolved} search "${query.replace(/"/g, '\\"')}" -c "${qmdCollectionName}" -n 5 2>/dev/null`;
        const qmdOutput = execSync(cmd, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 }).toString().trim();
        if (qmdOutput && qmdOutput.length > 0) {
          const lines = qmdOutput.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('qmd://')) {
              const qmdFileName = trimmed.split(' ')[0].replace('qmd://', '');
              const fileName = qmdFileName.includes('/') ? qmdFileName.split('/').pop() : qmdFileName;
              // QMD may return non-.md paths; resolve to .md if possible
              let mdFileName = qmdFile;
              if (!mdFileName.toLowerCase().endsWith('.md')) {
                const ext = path.extname(mdFileName);
                mdFileName = mdFileName.replace(ext, '.md');
              }
              // Find the .md file
              const mdPath = findMdFile(mdFileName);
              if (mdPath) {
                const relPath = path.relative(KB_PATH, mdPath);
                const stat = fs.statSync(mdPath);
                const content = fs.readFileSync(mdPath, 'utf-8');
                const meta = parseYamlFrontMatter(content);

                // Resolve original download path (same logic as searchMdFiles)
                let originalSrc = '';
                if (meta.source) {
                  const candidates = [];
                  if (path.isAbsolute(meta.source)) {
                    candidates.push(meta.source);
                  } else {
                    candidates.push(path.join(KB_PATH, meta.source));
                    candidates.push(path.dirname(mdPath) !== KB_PATH ? path.join(path.dirname(mdPath), path.basename(meta.source)) : null);
                    candidates.push(path.join(KB_PATH, path.basename(meta.source)));
                  }
                  for (const c of candidates) {
                    if (c && fs.existsSync(c)) {
                      originalSrc = path.relative(KB_PATH, c);
                      break;
                    }
                  }
                }
                if (!originalSrc) {
                  const stem = path.basename(mdPath, '.md');
                  const allFiles = scanFiles(KB_PATH);
                  for (const f of allFiles) {
                    const fStem = path.basename(f.name).replace(path.extname(f.name), '');
                    if (fStem === stem && f.name !== path.basename(mdPath)) {
                      originalSrc = f.relativePath;
                      break;
                    }
                  }
                }

                results.push({
                  title: path.basename(mdPath),
                  path: mdPath,
                  relativePath: relPath,
                  size: stat.size,
                  dir: path.dirname(relPath) !== '.' ? path.dirname(relPath) : null,
                  snippet: extractSnippet(content, query),
                  method: '语义检索',
                  score: parseFloat(parts[1]) || 0.8,
                  originalDownloadPath: originalSrc ? '/api/download/' + encodeURIComponent(originalSrc) : ''
                });
                seen.add(mdPath);
              }
            }
          }
        }
      }
    } catch (e) { /* QMD unavailable */ }

    // Phase 2: Full-text fallback if < 5 semantic results
    const semanticCount = results.filter(r => r.method === '语义检索').length;
    if (semanticCount < 5) {
      const ftResults = searchMdFiles(query, maxResults);
      for (const r of ftResults) {
        if (!seen.has(r.path)) {
          results.push(r);
          seen.add(r.path);
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ count: results.length, query, results: results.slice(0, maxResults), type: 'hybrid_search' });
  } catch (err) {
    console.error('[hybrid-search] Error:', err);
    // Fallback to plain search
    res.redirect(`/api/search?q=${encodeURIComponent(query)}`);
  }
});

// Helper: find a .md file by base name (process directories)
function findMdFile(baseName) {
  const files = scanFiles(KB_PATH);
  const mdFiles = files.filter(f => f.name.toLowerCase().endsWith('.md'));
  for (const f of mdFiles) {
    if (f.name === baseName) return f.path;
    // Also match if the md name contains the original's stem
    const stem = baseName.replace(/\.\w+$/, '');
    if (f.name === stem + '.md' || f.name.includes(stem)) return f.path;
  }
  return null;
}

// Helper: extract a meaningful snippet from .md content, centered on query keywords
function extractSnippet(content, query, maxLen = 250) {
  // Strip YAML front-matter
  let body = content;
  const fmMatch = content.match(/^---[\s\S]*?---\n*/);
  if (fmMatch) body = content.substring(fmMatch[0].length);

  // Normalize query to individual keywords
  const keywords = query.split(/[\s,，、]+/).filter(k => k.length >= 2);
  if (keywords.length === 0) {
    return body.substring(0, maxLen).trim() || '[语义匹配]';
  }

  // Find the first occurrence of any keyword
  let bestIdx = -1;
  let bestKw = '';
  for (const kw of keywords) {
    const idx = body.indexOf(kw);
    if (idx >= 0 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx;
      bestKw = kw;
    }
  }

  if (bestIdx < 0) {
    // Fallback: return first maxLen chars
    return body.substring(0, maxLen).trim() || '[语义匹配]';
  }

  const context = Math.floor((maxLen - bestKw.length) / 2);
  let start = Math.max(0, bestIdx - context);
  let end = Math.min(body.length, bestIdx + bestKw.length + context);

  // Adjust to avoid cutting in the middle of a line
  if (start > 0) {
    const nl = body.indexOf('\n', start);
    if (nl >= 0 && nl < end) start = nl + 1;
  }
  if (end < body.length) {
    const nl = body.lastIndexOf('\n', end);
    if (nl > start) end = nl;
  }

  let snippet = body.substring(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < body.length) snippet = snippet + '...';

  // Highlight keyword with 【】
  const hlIdx = snippet.indexOf(bestKw);
  if (hlIdx >= 0) {
    snippet = snippet.substring(0, hlIdx) + '【' + snippet.substring(hlIdx, hlIdx + bestKw.length) + '】' + snippet.substring(hlIdx + bestKw.length);
  }

  return snippet;
}

// ─── GET /api/hot-searches (top search keywords by frequency) ─
app.get('/api/hot-searches', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  try {
    const { getHotSearches } = require('./lib/database.cjs');
    const hot = getHotSearches(limit);
    res.json({ hot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/stats (dashboard charts data) ─────────────────
app.get('/api/stats', (req, res) => {
  try {
    const files = scanFiles(KB_PATH);
    // Categories
    const categories = {};
    for (const f of files) {
      let cat = f.category || '其他';
      if (cat === '根目录') cat = '其他';
      categories[cat] = (categories[cat] || 0) + 1;
    }
    // Extensions—排除图片文件（PNG/JPG/JPEG/GIF/WEBP/SVG）
    const imgExts = new Set(['PNG','JPG','JPEG','GIF','WEBP','SVG']);
    const extensions = {};
    for (const f of files) {
      const ext = (f.original_ext || f.original_name || f.name || '').split('.').pop().toUpperCase() || '?';
      if (imgExts.has(ext)) continue;
      extensions[ext] = (extensions[ext] || 0) + 1;
    }
    // Monthly trend (by mtime)—也排除图片
    const monthly = {};
    for (const f of files) {
      const ext = (f.original_ext || f.original_name || f.name || '').split('.').pop().toUpperCase() || '?';
      if (imgExts.has(ext)) continue;
      if (f.mtime) {
        const m = f.mtime.slice(0, 7);
        monthly[m] = (monthly[m] || 0) + 1;
      }
    }
    const monthlyTrend = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
    // Popular searches
    let popularSearches = [];
    try {
      const { getHotSearches } = require('./lib/database.cjs');
      popularSearches = getHotSearches(5);
    } catch(e) { /* silent */ }
    res.json({ categories, extensions, monthlyTrend, popularSearches });
  } catch (err) {
    console.error('[stats] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/download/* ───────────────────────────────────────
app.get('/api/download/*', (req, res) => {
  // Use the full wildcard match (preserves inner / and URL encoding)
  const rawPath = req.params[0] || '';
  // URL-decode the path
  const decoded = decodeURIComponent(rawPath);
  const filePath = path.join(KB_PATH, decoded);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(KB_PATH))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'File not found' });
  }
  // 图片类型 inline 显示，其他下载
  const ext = path.extname(resolved).toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
  if (imageExts.includes(ext)) {
    res.sendFile(resolved);
  } else {
    res.download(resolved, path.basename(resolved));
  }
});

// ─── GET /api/view-html — proxy HTML file with image path rewriting ───
app.get('/api/view-html', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'Missing path parameter' });
  const decoded = decodeURIComponent(filePath);
  const resolved = path.resolve(path.join(KB_PATH, decoded));
  if (!resolved.startsWith(path.resolve(KB_PATH))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'File not found' });
  }
  try {
    let html = fs.readFileSync(resolved, 'utf-8');
    var htmlDir = path.dirname(decoded);
    if (htmlDir === '.') htmlDir = '';
    if (htmlDir !== '') htmlDir += '/';
    // 重写本地图片/资源路径为 /api/download/...
    var rewriteRe = /(<(?:img|source|link|a)\s[^>]*?)(src|href)\s*=\s*"([^"]+)"/gi;
    html = html.replace(rewriteRe, function(match, prefix, attr, url) {
      if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('//') || url.startsWith('/')) {
        return match;
      }
      var fullRelPath = htmlDir + url;
      // 先 URL 解码（HTML 中的路径可能已编码），再重新编码，避免二次编码
      var decodedPath = decodeURIComponent(fullRelPath);
      // 保留路径分隔符 /，只编码文件名中的特殊字符
      var parts = decodedPath.split('/');
      var encodedParts = parts.map(function(p) { return encodeURIComponent(p); });
      return prefix + attr + '="/api/download/' + encodedParts.join('/') + '"';
    });
    // 移除所有 script 标签（安全）
    html = html.replace(/<script[^>]*>.*?<\/script>/gi, '');
    res.send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/preview — return .md file content as HTML (rendered markdown) ───

// ─── Find extracted images for a .md file ─────────────────────
function findPreviewImages(mdPath) {
  try {
    const mdDir = path.dirname(mdPath);
    const imagesDir = path.join(mdDir, '_images');
    if (!fs.existsSync(imagesDir)) return [];

    // Read YAML front-matter to get source filename stem
    const content = fs.readFileSync(mdPath, 'utf-8');
    let stem = path.basename(mdPath, '.md');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const yaml = fmMatch[1];
      const sourceMatch = yaml.match(/^source:\s*"(.+)"$/m);
      if (sourceMatch) {
        const sourcePath = sourceMatch[1];
        const sourceBase = path.basename(sourcePath);
        stem = path.basename(sourceBase, path.extname(sourceBase));
      }
    }

    // Image extensions to include
    const imgExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.emf', '.wmf']);

    const files = fs.readdirSync(imagesDir);
    const result = [];
    for (const f of files) {
      // Match by stem first, fallback to all viewable images
      const matchesStem = f.startsWith(stem + '_');
      if (!matchesStem) continue;
      const ext = path.extname(f).toLowerCase();
      const isViewable = imgExts.has(ext) && !['.emf', '.wmf'].includes(ext);
      if (!isViewable) continue;
      result.push({
        name: f,
        path: path.join(imagesDir, f),
        downloadPath: "/api/download/" + encodeURIComponent(path.relative(KB_PATH, path.join(imagesDir, f))),
        ext: ext.slice(1).toUpperCase(),
        viewable: isViewable
      });
    }
    // No stem-matched images? Return all viewable images
    if (result.length === 0) {
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        const isViewable = imgExts.has(ext) && !['.emf', '.wmf'].includes(ext);
        if (!isViewable) continue;
        result.push({
          name: f,
          path: path.join(imagesDir, f),
          downloadPath: "/api/download/" + encodeURIComponent(path.relative(KB_PATH, path.join(imagesDir, f))),
          ext: ext.slice(1).toUpperCase(),
          viewable: isViewable
        });
      }
    }
    return result.sort();
  } catch (e) { return []; }
}

// ─── Simple markdown to HTML (tables + basic formatting) ──────
function mdToHtml(md) {
  let html = md;
  // Escape HTML tags first to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = html.split('\n');
  const output = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isTableRow = /^\|.+\|$/.test(trimmed);

    if (isTableRow) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      // Skip separator row (|---|---|---|)
      // Match: only pipes, spaces, dashes, colons — no other chars
      if (/^[\|\s\-:]+$/.test(trimmed) && /-{2,}/.test(trimmed) && !/[^\|\s\-:]/.test(trimmed)) {
        continue;
      }
      // Parse cells
      const raw = trimmed.slice(1, -1).split('|');
      const cells = raw.map(c => c.trim());
      const rowHtml = cells.map(c => '<td>' + c + '</td>').join('');
      tableRows.push('<tr>' + rowHtml + '</tr>');
    } else {
      if (inTable) {
        if (tableRows.length > 0) {
          output.push('<table>' + tableRows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '<\/th>') + tableRows.slice(1).join('') + '<\/table>');
        }
        inTable = false;
        tableRows = [];
      }
      if (trimmed === '') {
        output.push('<p><br></p>');
      } else if (/^#{1,6}\s/.test(trimmed)) {
        const level = trimmed.match(/^#+/)[0].length;
        const text = trimmed.replace(/^#+\s*/, '');
        output.push('<h' + level + '>' + text + '<\/h' + level + '>');
      } else if (/^!\[.*\]\(.*\)/.test(trimmed)) {
        // Convert Markdown image reference to <img> tag with download path
        const imgMatch = trimmed.match(/^!\[(.*)\]\((.+)\)/);
        if (imgMatch) {
          const alt = imgMatch[1];
          let src = imgMatch[2];
          // If src is _images/xxx, need to figure out the relative path
          // Use the path from request context or resolve against KB_PATH
          // Since we don't have context here, leave as relative but wrap in <img>
          output.push('<p class="md-image-container"><img src="' + src + '" alt="' + alt.replace(/"/g,'&quot;') + '" loading="lazy" onclick="viewImage(this.src)" style="max-width:100%;cursor:pointer;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);"></img><br><span style="font-size:0.85em;color:#666;">' + alt.replace(/"/g,'&quot;') + '</span></p>');
        }
      } else if (/^[\*\-\+]\s/.test(trimmed)) {
        const text = trimmed.replace(/^[\*\-\+]\s*/, '');
        output.push('<li>' + text + '</li>');
      } else if (/^\d+\.\s/.test(trimmed)) {
        const text = trimmed.replace(/^\d+\.\s*/, '');
        output.push('<li>' + text + '</li>');
      } else {
        let processed = trimmed
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>');
        output.push('<p>' + processed + '</p>');
      }
    }
  }
  if (inTable && tableRows.length > 0) {
    output.push('<table>' + tableRows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '<\/th>') + tableRows.slice(1).join('') + '<\/table>');
  }

  return output.join('\n');
}

app.get('/api/preview', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: "Missing path parameter" });
  const decoded = decodeURIComponent(filePath);
  // Relative paths should be resolved within KB_PATH, not CWD
  const resolved = path.isAbsolute(decoded)
    ? path.resolve(decoded)
    : path.resolve(KB_PATH, decoded);
  if (!resolved.startsWith(path.resolve(KB_PATH))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const content = fs.readFileSync(resolved, "utf-8");
    // Strip YAML front-matter
    let body = content;
    const fmMatch = content.match(/^---[\s\S]*?---\n*/);
    if (fmMatch) {
      body = content.substring(fmMatch[0].length);
    }
    // Find associated images
    const images = findPreviewImages(resolved);
    // Convert markdown to HTML
    const htmlContent = mdToHtml(body);

    // ── Layout view: try to find original PDF and run pdftotext -layout ──
    let layoutText = null;
    try {
      const sourceMatch = fmMatch ? content.match(/^source:\s*"(.+)"$/m) : null;
      if (sourceMatch) {
        const origPath = sourceMatch[1];
        const ext = path.extname(origPath).toLowerCase();
        if (ext === '.pdf' && fs.existsSync(origPath)) {
          const { execFileSync } = require('child_process');
          const result = execFileSync('pdftotext', ['-layout', origPath, '-'], { timeout: 30000, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
          if (result && result.trim()) {
            layoutText = result;
          }
        }
      }
    } catch (e) {
      // layout extraction is best-effort
      console.error('[preview] layout extraction failed:', e.message);
    }

    res.json({
      success: true,
      path: decoded,
      name: path.basename(resolved),
      content: body,
      html_content: htmlContent,
      images: images,
      layout_text: layoutText
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Logging helper ────────────────────────────────────────
function logAction(req, action, detail) {
  try {
    const db = getDb();
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userId = req.session?.userId || null;
    const username = req.session?.username || 'system';
    db.prepare('INSERT INTO logs (user_id, username, action, detail, ip_address) VALUES (?, ?, ?, ?, ?)').run(userId, username, action, JSON.stringify(detail), ip);
  } catch(e) { console.error('[log] Error:', e.message); }
}

/**
 * 上传后后台触发 QMD 增量更新索引（不阻塞响应）
 */
function triggerQmdUpdate() {
  const { exec } = require('child_process');
  exec('qmd update 2>/dev/null', { timeout: 60000 }, (err) => {
    if (err) {
      console.error('[qmd-update] update failed:', err.message);
      return;
    }
    // embeddings 异步生成
    exec('qmd embed 2>/dev/null', { timeout: 300000 }, (err2) => {
      if (err2) console.error('[qmd-update] embed failed:', err2.message);
      else console.log('[qmd-update] index + embed complete');
    });
  });
}

/**
 * 记录无需 req 对象的内部操作日志
 */
function logActionInternal(action, detail) {
  try {
    const db = getDb();
    db.prepare("INSERT INTO logs (user_id, username, action, detail, ip_address) VALUES (NULL, 'system', ?, ?, 'internal')").run(action, typeof detail === 'string' ? detail : JSON.stringify(detail));
  } catch(e) { console.error('[log-internal] Error:', e.message); }
}

// ─── Check admin middleware ─────────────────────────────────
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: '未登录' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: '无权限，仅管理员可操作' });
  next();
}

// ─── User Management API ───────────────────────────────────
app.get('/api/users', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, username, role, status, last_login, created_at FROM users ORDER BY id').all();
    res.json(users);
  } catch(err) {
    console.error('[users] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireAdmin, (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: '角色无效' });
    const bcrypt = require('bcryptjs');
    const db = getDb();
    // 检查重复
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: '用户名已存在' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
    logAction(req, 'user_create', { username, role });
    const user = db.prepare('SELECT id, username, role, status, last_login, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch(err) {
    console.error('[users create] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: '角色无效' });
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    logAction(req, 'user_edit', { userId: id, username: user.username, role });
    const updated = db.prepare('SELECT id, username, role, status, last_login, created_at FROM users WHERE id = ?').get(id);
    res.json(updated);
  } catch(err) {
    console.error('[users edit] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id/status', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'disabled'].includes(status)) return res.status(400).json({ error: '状态无效' });
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
    logAction(req, status === 'disabled' ? 'user_disable' : 'user_enable', { userId: id, username: user.username });
    const updated = db.prepare('SELECT id, username, role, status, last_login, created_at FROM users WHERE id = ?').get(id);
    res.json(updated);
  } catch(err) {
    console.error('[users status] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id/reset-password', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
    logAction(req, 'password_reset', { userId: id, username: user.username });
    res.json({ success: true });
  } catch(err) {
    console.error('[users reset-pw] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    logAction(req, 'user_delete', { userId: id, username: user.username });
    res.json({ success: true });
  } catch(err) {
    console.error('[users delete] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Logs API ────────────────────────────────────────────
app.get('/api/log-actions', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const actions = db.prepare('SELECT DISTINCT action FROM logs ORDER BY action').all().map(r => r.action);
    res.json(actions);
  } catch(err) {
    console.error('[log-actions] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { action, page = 1, pageSize = 50 } = req.query;
    let where = '';
    const params = [];
    if (action) {
      where = 'WHERE action = ?';
      params.push(action);
    }
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const total = db.prepare('SELECT COUNT(*) as cnt FROM logs ' + where).get(...params).cnt;
    const logs = db.prepare('SELECT * FROM logs ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?').all(...params, parseInt(pageSize), offset);
    res.json({ logs, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch(err) {
    console.error('[logs] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/files/batch-delete ────────────────────────────
app.post('/api/files/batch-delete', requireAdmin, (req, res) => {
  const { paths } = req.body;
  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'paths 必须是数组' });
  }
  let deleted = 0;
  const deletedNames = [];
  for (const relPath of paths) {
    try {
      const resolved = path.resolve(path.join(KB_PATH, relPath));
      if (!resolved.startsWith(path.resolve(KB_PATH))) continue;
      if (!fs.existsSync(resolved)) continue;

      // 删除源文件
      fs.unlinkSync(resolved);

      // 删除对应的 .md 文件
      const ext = path.extname(resolved);
      const mdFile = resolved.replace(ext, '.md');
      if (fs.existsSync(mdFile)) fs.unlinkSync(mdFile);

      // 删除 _images 目录中同名的图片
      const parentDir = path.dirname(resolved);
      const baseName = path.basename(resolved, ext);
      const imgDir = path.join(parentDir, '_images');
      if (fs.existsSync(imgDir)) {
        const imgFiles = fs.readdirSync(imgDir);
        for (const img of imgFiles) {
          if (img.startsWith(baseName + '_') || img.startsWith(baseName + '.')) {
            fs.unlinkSync(path.join(imgDir, img));
          }
        }
      }

      deleted++;
      deletedNames.push(path.basename(resolved));
    } catch (err) {
      console.error(`[batch-delete] Error deleting ${relPath}:`, err.message);
    }
  }
  logAction(req, 'batch-delete-files', { files: deletedNames });
  res.json({ success: true, deleted });
});

// ─── PUT /api/files/batch-category ─────────────────────────────
const VALID_CATEGORIES = ['方案', '报告', '密评FAQ', '标准规范', '法规政策', '参考文档', '其他'];

app.put('/api/files/batch-category', requireAdmin, (req, res) => {
  const { paths, category } = req.body;
  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'paths 必须是数组' });
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: '无效分类', validCategories: VALID_CATEGORIES });
  }

  const targetDir = path.join(KB_PATH, category);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  const targetImgDir = path.join(targetDir, '_images');
  if (!fs.existsSync(targetImgDir)) fs.mkdirSync(targetImgDir, { recursive: true });

  let updated = 0;
  const updatedNames = [];
  for (const relPath of paths) {
    try {
      const resolved = path.resolve(path.join(KB_PATH, relPath));
      if (!resolved.startsWith(path.resolve(KB_PATH))) continue;
      if (!fs.existsSync(resolved)) continue;

      const fileName = path.basename(resolved);
      const destPath = path.join(targetDir, fileName);

      // 移动文件
      fs.renameSync(resolved, destPath);

      // 移动对应的 .md 文件
      const ext = path.extname(resolved);
      const mdFile = resolved.replace(ext, '.md');
      const destMd = destPath.replace(ext, '.md');
      if (fs.existsSync(mdFile)) {
        fs.renameSync(mdFile, destMd);
      }

      // 移动 _images 中的关联图片
      const baseName = path.basename(resolved, ext);
      const srcImgDir = path.dirname(resolved);
      const srcImgFull = path.join(srcImgDir, '_images');
      if (fs.existsSync(srcImgFull)) {
        const imgFiles = fs.readdirSync(srcImgFull);
        for (const img of imgFiles) {
          if (img.startsWith(baseName + '_') || img.startsWith(baseName + '.')) {
            try {
              fs.renameSync(
                path.join(srcImgFull, img),
                path.join(targetImgDir, img)
              );
            } catch {}
          }
        }
      }

      updated++;
      updatedNames.push(fileName);
    } catch (err) {
      console.error(`[batch-category] Error moving ${relPath}:`, err.message);
    }
  }
  logAction(req, 'batch-category-files', { files: updatedNames, category });
  res.json({ success: true, updated });
});

// ─── DELETE /api/delete ────────────────────────────────────────
app.delete('/api/delete', (req, res) => {
  const filePath = req.body.path || req.query.path;
  if (!filePath) return res.status(400).json({ error: 'No path provided' });
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(KB_PATH))) return res.status(403).json({ error: 'Forbidden' });
  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    const ext = path.extname(resolved);
    if (ext !== '.md') {
      const mdFile = resolved.replace(ext, '.md');
      if (fs.existsSync(mdFile)) fs.unlinkSync(mdFile);
    }
    logAction(req, 'delete', { path: filePath });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FAQ API ────────────────────────────────────────────────────
app.get('/api/faq', (req, res) => {
  try {
    const db = getDb();
    const query = req.query.q ? '%' + req.query.q + '%' : null;
    const rows = query
      ? db.prepare('SELECT * FROM faq WHERE question LIKE ? OR answer LIKE ? ORDER BY created_at DESC').all(query, query)
      : db.prepare('SELECT * FROM faq ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faq', requireAdmin, (req, res) => {
  try {
    const { question, answer, category, source_file, source_section } = req.body;
    if (!question || !answer) return res.status(400).json({ error: '问题和答案不能为空' });
    const db = getDb();
    const r = db.prepare('INSERT INTO faq (question, answer, category, created_by, source_file, source_section, extracted) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      question, answer, category || '', req.session.userId,
      source_file || '', source_section || '', source_file ? 1 : 0
    );
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/faq/resolve-file — 在知识库中按文件名查找 ───
app.get('/api/faq/resolve-file', (req, res) => {
  const filename = (req.query.name || '').trim();
  if (!filename) return res.json({ found: false });
  const fullPath = resolveFileInKB(filename);
  if (!fullPath) return res.json({ found: false });
  const relPath = path.relative(KB_PATH, fullPath);
  const isHtml = /\.html?$/i.test(filename);
  const downloadUrl = isHtml ? '/api/view-html?path=' + encodeURIComponent(relPath) : '/api/download/' + encodeURIComponent(relPath);
  res.json({ found: true, relPath, downloadUrl, isHtml });
});

// ─── FAQ 批量管理 API（PRD-007 — 非参数化路由，必须在 :id 之前注册）─

// GET /api/faq/auto-extract-status — 文件抽取状态
app.get('/api/faq/auto-extract-status', (req, res) => {
  const filePath = req.query.file;
  if (!filePath) return res.status(400).json({ success: false, error: 'Missing file parameter' });
  try {
    const db = getDb();
    const sourceFileName = path.basename(filePath);
    const row = db.prepare(
      'SELECT COUNT(*) as cnt, MAX(created_at) as last_at FROM faq WHERE source_file = ? AND extracted = 1'
    ).get(sourceFileName);
    res.json({
      success: true,
      file: filePath,
      extracted: row.cnt > 0,
      count: row.cnt,
      last_extracted_at: row.last_at || null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/faq/auto-extract-log — 自动抽取日志
app.get('/api/faq/auto-extract-log', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const totalRow = db.prepare("SELECT COUNT(*) as total FROM logs WHERE action = 'faq_auto_extract'").get();
    const logs = db.prepare(
      "SELECT id, username, action, detail, created_at FROM logs WHERE action = 'faq_auto_extract' ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(limit, offset);

    res.json({
      success: true,
      logs: logs.map(l => ({
        ...l,
        // detail 可能是 JSON 字符串，尝试解析
        detail: (() => { try { return JSON.parse(l.detail); } catch { return l.detail; } })()
      })),
      total: totalRow.total,
      page,
      limit
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/faq/categories — 去重分类列表
app.get('/api/faq/categories', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT DISTINCT category FROM faq WHERE category != '' ORDER BY category").all();
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/faq/batch-delete — 批量删除
app.post('/api/faq/batch-delete', requireAdmin, (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids 不能为空' });
    }
    const db = getDb();
    const del = db.prepare('DELETE FROM faq WHERE id=?');
    let deleted = 0;
    const txn = db.transaction(() => {
      for (const id of ids) {
        const r = del.run(id);
        if (r.changes > 0) deleted++;
      }
    });
    txn();
    logAction(req, 'faq_batch_delete', { ids, deleted });
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/faq/batch-category — 批量修改分类
app.put('/api/faq/batch-category', requireAdmin, (req, res) => {
  try {
    const { ids, category } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids 不能为空' });
    }
    if (!category) {
      return res.status(400).json({ error: 'category 不能为空' });
    }
    const db = getDb();
    const update = db.prepare("UPDATE faq SET category=?, updated_at=datetime('now') WHERE id=?");
    let updated = 0;
    const txn = db.transaction(() => {
      for (const id of ids) {
        const r = update.run(category, id);
        if (r.changes > 0) updated++;
      }
    });
    txn();
    logAction(req, 'faq_batch_category', { ids, category, updated });
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/faq/import — 批量导入（CSV/JSON 文件）
app.post('/api/faq/import', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });

// ─── 参数化路由 — 必须在非参数化路由之后注册 ─────────────────

app.put('/api/faq/:id', requireAdmin, (req, res) => {
  try {
    const { question, answer, category, source_file, source_section } = req.body;
    if (!question || !answer) return res.status(400).json({ error: '问题和答案不能为空' });
    const db = getDb();
    db.prepare("UPDATE faq SET question=?, answer=?, category=?, source_file=?, source_section=?, updated_at=datetime('now') WHERE id=?").run(
      question, answer, category || '', source_file || '', source_section || '', req.params.id
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/faq/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM faq WHERE id=?').run(req.params.id);
    logAction(req, 'faq_delete', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

    const content = fs.readFileSync(req.file.path, 'utf-8');
    const ext = path.extname(req.file.originalname).toLowerCase();
    let entries = [];

    if (ext === '.json') {
      const parsed = JSON.parse(content);
      entries = Array.isArray(parsed) ? parsed : [parsed];
    } else if (ext === '.csv') {
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return res.status(400).json({ error: 'CSV 格式错误：至少需要表头+一行数据' });
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
      const qIdx = headers.indexOf('question');
      const aIdx = headers.indexOf('answer');
      const cIdx = headers.indexOf('category');
      if (qIdx === -1 || aIdx === -1) {
        return res.status(400).json({ error: 'CSV 必须包含 question 和 answer 列' });
      }
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const entry = { question: cols[qIdx] || '', answer: cols[aIdx] || '' };
        if (cIdx !== -1) entry.category = cols[cIdx] || '';
        entries.push(entry);
      }
    } else {
      return res.status(400).json({ error: '仅支持 .csv 和 .json 文件' });
    }

    // 清理临时文件
    try { fs.unlinkSync(req.file.path); } catch {}

    const db = getDb();
    const insert = db.prepare('INSERT INTO faq (question, answer, category, created_by) VALUES (?, ?, ?, ?)');
    let imported = 0;
    const txn = db.transaction(() => {
      for (const e of entries) {
        if (!e.question || !e.answer) continue;
        insert.run(e.question.trim(), e.answer.trim(), (e.category || '').trim(), req.session.userId);
        imported++;
      }
    });
    txn();

    logAction(req, 'faq_import', { fileName: req.file.originalname, imported });
    res.json({ success: true, imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/faq/export — 批量导出
app.get('/api/faq/export', requireAdmin, (req, res) => {
  try {
    const format = (req.query.format || 'json').toLowerCase();
    const category = req.query.category || null;
    const db = getDb();

    let rows;
    if (category) {
      rows = db.prepare('SELECT * FROM faq WHERE category=? ORDER BY id').all(category);
    } else {
      rows = db.prepare('SELECT * FROM faq ORDER BY id').all();
    }

    if (format === 'csv') {
      let csv = 'question,answer,category,source_file,source_section\n';
      for (const r of rows) {
        const esc = (s) => '"' + (s || '').replace(/"/g, '""') + '"';
        csv += `${esc(r.question)},${esc(r.answer)},${esc(r.category)},${esc(r.source_file)},${esc(r.source_section)}\n`;
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="faq-export.csv"');
      res.send(csv);
    } else {
      const exportData = rows.map(r => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        category: r.category,
        source_file: r.source_file || '',
        source_section: r.source_section || '',
        created_at: r.created_at
      }));
      res.json(exportData);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve index.html ──────────────────────────────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Not found');
});

// ─── Start ─────────────────────────────────────────────────────
// Startup hardcoded test for path resolution
(function() {
  const testPath = '/home/zhang/company_knowledge_base/密评FAQ/密评FAQ指南.pdf';
  console.log(`[startup test] existsSync("${testPath}"): ${fs.existsSync(testPath)}`);
  const dir = '密评FAQ/';
  const source = '密评FAQ指南.pdf';
  const joined = path.join(KB_PATH, dir, source);
  console.log(`[startup test] path.join("${KB_PATH}", "${dir}", "${source}") = "${joined}" exists=${fs.existsSync(joined)}`);
})();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`KB_PATH: ${KB_PATH}`);
  if (!fs.existsSync(KB_PATH)) fs.mkdirSync(KB_PATH, { recursive: true });
});
