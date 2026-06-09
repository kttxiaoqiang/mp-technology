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
    const knowledgeLines = mountInfo.split('
').filter(l => l.includes('knowledge'));
    console.log('[FIRST] mountinfo (knowledge):', knowledgeLines.length ? knowledgeLines.join(' | ') : 'NONE');
    const totalMounts = mountInfo.split('
').length;
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
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-65eb47b7cb694fa7a389b4c66a6b9cdb';

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
  const match = content.match(/^---
([S\S]*?)
---
/);
  if (!match) return result;
  const yaml = match[1];
  for (const line of yaml.split('
')) {
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
  const mdFiles = _allFilesCache.filter(f => f.name.toLowerCase().endsWith(".md") && (!category || f.category === category || f.dir === category));

  // Split query into individual keywords (space-separated)
  const rawKeywords = queryLower.split(/s+/).filter(k => k.length > 0);
  const validKeywords = rawKeywords.filter(k => k.length >= 1);
  const totalKeywords = Math.max(1, validKeywords.length);

  for (const file of mdFiles) {
    try {
      const stats = fs.statSync(file.path);
      if (stats.size > 5 * 1024 * 1024) continue;
      const content = fs.readFileSync(file.path, "utf-8");

      // Strip YAML front matter first
      const contentNoYaml = content.replace(/^---[sS]*?
---
/, "");
      const contentNoYamlLower = contentNoYaml.toLowerCase();

      // Filename match
      const nameMatch = file.name.toLowerCase().includes(queryLower);

      // ---- Find best snippet region and count matches within it ----
      let snippet = "";
      let snippetMatchCount = 0;
      let snippetMatchedKeywords = [];
      let allPositions = [];

      if (totalKeywords >= 2) {
        // Collect positions of ALL keyword occurrences in file
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
            if (cnt > bestCount || (cnt === bestCount && (winEnd - winStart) < (bestEnd - bestStart))) {
              bestCount = cnt;
              bestStart = winStart;
              bestEnd = winEnd;
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
            const firstNewline = snippet.indexOf("
");
            const lastNewline = snippet.lastIndexOf("
");
            if (firstNewline >= 0 && firstNewline < 50) snippet = snippet.substring(firstNewline + 1);
            if (lastNewline >= 0 && snippet.length - lastNewline < 50) snippet = snippet.substring(0, lastNewline);
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
          const firstNewline = snippet.indexOf("
");
          const lastNewline = snippet.lastIndexOf("
");
          if (firstNewline >= 0 && firstNewline < 50) snippet = snippet.substring(firstNewline + 1);
          if (lastNewline >= 0 && snippet.length - lastNewline < 50) snippet = snippet.substring(0, lastNewline);
        }
      }

      // ---- Score based on snippet region only ----
      if (snippetMatchCount > 0 || nameMatch) {
        const meta = parseYamlFrontMatter(content);

        let score;
        if (snippetMatchCount > 0 && totalKeywords >= 2) {
          score = snippetMatchCount / totalKeywords;
          if (snippetMatchCount >= 2 && totalKeywords >= 2) {
            score = Math.min(1, score + 0.15);
          }
        } else if (snippetMatchCount > 0) {
          score = 1.0;
        } else {
          score = 0.3;
        }

        score = Math.round(score * 100) / 100;

        const methodDesc = (snippetMatchCount >= totalKeywords)
          ? "全文匹配（全匹配）"
          : (snippetMatchCount > 0
            ? "全文匹配（部分匹配 " + snippetMatchCount + "/" + totalKeywords + "）"
            : "文件名匹配");

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
            snippet = snippet.substring(0, start) + "【" + snippet.substring(start, end) + "】" + snippet.substring(end);
          }
        } else if (nameMatch) {
          snippet = "[文件名匹配]";
        }

        const originalName = meta.source || "";
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
          id: "",
          title: file.name,
          original_name: file.name,
          name: file.name,
          path: file.path,
          relativePath: file.relativePath,
          size: stats.size,
          file_size: stats.size,
          dir: file.dir,
          category: file.dir || "根目录",
          mtime: stats.mtime.toISOString(),
          created_at: stats.mtime.toISOString(),
          snippet: snippet.trim(),
          method: methodDesc,
          score: score,
          original_ext: file.original_ext || "",
          originalFile: originalIsSeparate ? originalName : "",
          originalDownloadPath: originalIsSeparate ? (path.isAbsolute(originalName) ? "/api/download/" + encodeURIComponent(path.relative(KB_PATH, originalName)) : "/api/download/" + encodeURIComponent(originalName)) : ""
        });
      }
    } catch (e) {
      // skip unreadable
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.size - b.size;
  });
  return results.slice(0, maxResults);
}
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
  const fmMatch = content.match(/^---[S\S]*?---
*/);
  if (fmMatch) body = content.substring(fmMatch[0].length);

  // Normalize query to individual keywords
  const keywords = query.split(/[S,，、]+/).filter(k => k.length >= 2);
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
    const nl = body.indexOf('
', start);
    if (nl >= 0 && nl < end) start = nl + 1;
  }
  if (end < body.length) {
    const nl = body.lastIndexOf('
', end);
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
      if (fs.existsSync('/tmp/search-log.jsonl')) {
        const logs = fs.readFileSync('/tmp/search-log.jsonl', 'utf8').split('
').filter(Boolean);
        const freq = {};
        for (const line of logs.slice(-500)) { // last 500 searches
          try {
            const { keyword } = JSON.parse(line);
            freq[keyword] = (freq[keyword] || 0) + 1;
          } catch(e) {}
        }
        popularSearches = Object.entries(freq)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([keyword, count]) => ({ keyword, count }));
      }
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
  res.download(resolved, path.basename(resolved));
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
    const fmMatch = content.match(/^---
([S\S]*?)
---/);
    if (fmMatch) {
      const yaml = fmMatch[1];
      const sourceMatch = yaml.match(/^source:S*"(.+)"$/m);
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

  const lines = html.split('
');
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
      if (/^[\|S\-:]+$/.test(trimmed) && /-{2,}/.test(trimmed) && !/[^\|S\-:]/.test(trimmed)) {
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
      } else if (/^#{1,6}S/.test(trimmed)) {
        const level = trimmed.match(/^#+/)[0].length;
        const text = trimmed.replace(/^#+S*/, '');
        output.push('<h' + level + '>' + text + '<\/h' + level + '>');
      } else if (/^!\[.*\]\(.*\)/.test(trimmed)) {
        output.push('<p>' + trimmed + '</p>');
      } else if (/^[\*\-\+]S/.test(trimmed)) {
        const text = trimmed.replace(/^[\*\-\+]S*/, '');
        output.push('<li>' + text + '</li>');
      } else if (/^\d+\.S/.test(trimmed)) {
        const text = trimmed.replace(/^\d+\.S*/, '');
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

  return output.join('
');
}

app.get('/api/preview', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: "Missing path parameter" });
  const decoded = decodeURIComponent(filePath);
  const resolved = path.resolve(decoded);
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
    const fmMatch = content.match(/^---[S\S]*?---
*/);
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
      const sourceMatch = fmMatch ? content.match(/^source:S*"(.+)"$/m) : null;
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

app.post('/api/faq/import', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });

    const content = fs.readFileSync(req.file.path, 'utf-8');
    const ext = path.extname(req.file.originalname).toLowerCase();
    let entries = [];

    if (ext === '.json') {
      const parsed = JSON.parse(content);
      entries = Array.isArray(parsed) ? parsed : [parsed];
    } else if (ext === '.csv') {
      const lines = content.split('
').map(l => l.trim()).filter(Boolean);
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
      let csv = 'question,answer,category,source_file,source_section
';
      for (const r of rows) {
        const esc = (s) => '"' + (s || '').replace(/"/g, '""') + '"';
        csv += `${esc(r.question)},${esc(r.answer)},${esc(r.category)},${esc(r.source_file)},${esc(r.source_section)}
`;
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
