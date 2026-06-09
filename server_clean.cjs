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

// ─── TOP-LEVEL BOOT TEST (after require) ─────────────────────
try {
  const bootAfter = '/home/zhang/company_knowledge_base/密评FAQ/密评FAQ指南.pdf';
  console.log(`[BOOT_AFTER] existsSync("${bootAfter}"): ${fs.existsSync(bootAfter)}`);
} catch(e) { console.error('[BOOT_AFTER] Error:', e.message); }

const app = express();
const PORT = process.env.PORT || 3344;
const KB_PATH = process.env.KB_PATH || '/home/zhang/company_knowledge_base';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/originals', express.static(KB_PATH));

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
  const _map = new Map();
  const _map = new Map();
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
      if (matchedOrig) _map.set(md.path, matchedOrig);
    } catch (e) { /* skip */ }
  }
  _mdFileMapCache = _map;
  return _map;
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
      results.push({
        name: entry.name,
        path: fullPath,
        relativePath: path.join(relativePath, entry.name),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        dir: relativePath || null
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
function searchMdFiles(query, maxResults = 20) {
  refreshFileCache();
  const mdFileMap = getMdFileMap();
  const queryLower = query.toLowerCase();
  const results = [];
  const mdFiles = _allFilesCache.filter(f => f.name.toLowerCase().endsWith('.md'));

  for (const file of mdFiles) {
    try {
      const stats = fs.statSync(file.path);
      if (stats.size > 5 * 1024 * 1024) continue; // skip large files
      const content = fs.readFileSync(file.path, 'utf-8');
      const contentLower = content.toLowerCase();

      // Check filename match as well
      const nameMatch = file.name.toLowerCase().includes(queryLower);

      if (contentLower.includes(queryLower) || nameMatch) {
        // Parse YAML for source info
        const meta = parseYamlFrontMatter(content);

        // Generate snippet with highlight
        const idx = contentLower.indexOf(queryLower);
        let snippet = '';
        if (idx >= 0) {
          const snippetStart = Math.max(0, idx - 80);
          const snippetEnd = Math.min(content.length, idx + query.length + 120);
          snippet = content.substring(snippetStart, snippetEnd);
          // Clean to line boundaries
          const firstNewline = snippet.indexOf('\n');
          const lastNewline = snippet.lastIndexOf('\n');
          if (firstNewline >= 0 && firstNewline < 50) snippet = snippet.substring(firstNewline + 1);
          if (lastNewline >= 0 && snippet.length - lastNewline < 50) snippet = snippet.substring(0, lastNewline);
          // Highlight the query
          const hlIdx = snippet.toLowerCase().indexOf(queryLower);
          if (hlIdx >= 0) {
            snippet = snippet.substring(0, hlIdx) + '【' + snippet.substring(hlIdx, hlIdx + query.length) + '】' + snippet.substring(hlIdx + query.length);
          }
        } else {
          snippet = '[文件名匹配]';
        }

        // Build download URLs
        const originalName = meta.source || '';
        const originalIsSeparate = originalName && fs.existsSync(path.join(KB_PATH, originalName));

        results.push({
          title: file.name,
          path: file.path,
          relativePath: file.relativePath,
          size: stats.size,
          dir: file.dir,
          snippet: snippet.trim(),
          method: '全文匹配',
          score: nameMatch ? 0.9 : 1.0,
          // Source info for original file download
          originalFile: originalIsSeparate ? originalName : '',
          originalDownloadPath: originalIsSeparate ? originalName : ''
        });
      }
    } catch (e) {
      // skip unreadable
    }
    if (results.length >= maxResults) break;
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

// ─── GET /api/files ────────────────────────────────────────────
app.get('/api/files', (req, res) => {
  try {
    const files = scanFiles(KB_PATH);
    const groups = {};
    for (const f of files) {
      const group = f.dir || '根目录';
      if (!groups[group]) groups[group] = [];
      groups[group].push(f);
    }
    res.json({ count: files.length, files, groups });
  } catch (err) {
    console.error('[files] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/upload (single file) ────────────────────────────
app.post('/api/upload', (req, res) => {
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

    try {
      const category = detectCategory(filename);
      let movedPath = originalPath;
      if (category !== '其他') {
        const categoryDir = path.join(KB_PATH, category);
        if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });
        const destPath = path.join(categoryDir, filename);
        fs.renameSync(originalPath, destPath);
        movedPath = destPath;
      }
      const mdPath = await autoConvertToMd(movedPath);
      res.json({
        success: true,
        file: { name: filename, size: req.file.size, path: movedPath, category },
        convertedToMd: !!mdPath,
        mdFile: mdPath ? path.basename(mdPath) : null
      });
    } catch (err) {
      console.error(`[upload] Error:`, err);
      res.json({
        success: true,
        file: { name: filename, size: req.file.size, path: originalPath, category: '其他' },
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
      results.push({
        name: filename, size: file.size, category,
        converted: !!mdPath, mdFile: mdPath ? path.basename(mdPath) : null
      });
    }
    res.json({ success: true, files: results, count: results.length });
  });
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

  try {
    const results = searchMdFiles(query, parseInt(req.query.limit) || 20);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ count: results.length, query, results });
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

    // Phase 1: QMD semantic search (only returns .md files)
    try {
      const { execSync } = require('child_process');
      const qmdPath = '/usr/local/bin/qmd';
      if (fs.existsSync(qmdPath)) {
        const cmd = `${qmdPath} query "${query.replace(/"/g, '\\"')}" -c "${KB_PATH}" -n 5 2>/dev/null`;
        const qmdOutput = execSync(cmd, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }).toString().trim();
        if (qmdOutput && qmdOutput.length > 0) {
          const lines = qmdOutput.split('\n');
          for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
              const qmdFile = path.basename(parts[0]);
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
                  const candidates = [
                    path.join(KB_PATH, meta.source),
                    path.dirname(mdPath) !== KB_PATH ? path.join(path.dirname(mdPath), path.basename(meta.source)) : null,
                    path.join(KB_PATH, path.basename(meta.source))
                  ].filter(Boolean);
                  for (const c of candidates) {
                    if (fs.existsSync(c)) {
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
                  snippet: parts.length >= 3 ? parts[2] : '[语义匹配]',
                  method: '语义检索',
                  score: parseFloat(parts[1]) || 0.8,
                  originalDownloadPath: originalSrc
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve index.html ──────────────────────────────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
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
