/**
 * lib/convert.cjs — Document conversion module
 * Uses pdftotext (PDF) + LibreOffice (docx/xlsx/pptx/etc) via Python wrapper
 * Native handling for .md/.txt/.csv
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PYTHON_SCRIPT = path.join(__dirname, 'convert_markitdown.py');
const KB_PATH = process.env.KB_PATH || '/home/zhang/company_knowledge_base';
const PYTHON_BIN = '/home/zhang/桌面/openclaw-env/bin/python3';

// ─── Category detection rules ───
const CATEGORY_RULES = [
  { name: '密评FAQ', keywords: ['faq', '密评', '合规'] },
  { name: '方案', keywords: ['方案', '设计'] },
  { name: '报告', keywords: ['报告', '评估'] },
  { name: '标准规范', keywords: ['gmt', 'gm/t', 'gm-t', 'gb/t', '标准', '规范', '要求', '指南'] },
  { name: '法规政策', keywords: ['法规', '法律', '政策', '办法', '通知'] },
  { name: '参考文档', keywords: ['参考', '说明', '手册'] }
];
const DEFAULT_CATEGORY = '其他';

/**
 * Detect category from filename based on keyword matching
 */
function detectCategory(filename) {
  const lower = filename.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return rule.name;
      }
    }
  }
  return DEFAULT_CATEGORY;
}

/**
 * Convert document to Markdown using Python subprocess (pdftotext/LibreOffice)
 */
async function convertWithMarkItDown(filePath) {
  return new Promise((resolve, reject) => {
    const absPath = path.resolve(filePath);

    // Check file exists
    if (!fs.existsSync(absPath)) {
      return reject(new Error(`File not found: ${absPath}`));
    }

    const ext = path.extname(absPath).toLowerCase();

    execFile(PYTHON_BIN, [PYTHON_SCRIPT, absPath, 'md'], {
      timeout: 120000,  // 2 minutes for large files
      maxBuffer: 50 * 1024 * 1024  // 50MB
    }, (error, stdout, stderr) => {
      if (error) {
        const errMsg = stderr ? stderr.trim() : error.message;
        return reject(new Error(`Convert failed: ${errMsg}`));
      }

      const lines = stdout.split('\n');
      const header = lines[0].trim();

      if (!header.startsWith('OK')) {
        const errMsg = stderr ? stderr.trim() : `Unexpected output: ${header}`;
        return reject(new Error(`Convert failed: ${errMsg}`));
      }

      const content = lines.slice(1).join('\n').trim();
      if (!content) {
        return reject(new Error('Convert returned empty content'));
      }

      resolve(content);
    });
  });
}

/**
 * Extract text content from any supported file.
 * Returns the full markdown/text content.
 */
async function toMarkdown(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // Native text-based formats
  if (ext === '.md' || ext === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  // CSV → Markdown table
  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf-8');
    const rows = content.split('\n').filter(r => r.trim());
    if (rows.length === 0) return '*(空表格)*\n';

    const headers = rows[0].split(',').map(h => h.trim());
    const tableHeader = `| ${headers.join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows = rows.slice(1).map(row => {
      const cells = row.split(',').map(c => c.trim());
      return `| ${cells.join(' | ')} |`;
    });

    return [tableHeader, separator, ...dataRows].join('\n');
  }

  // Pass to Python converter for binary types
  try {
    return await convertWithMarkItDown(filePath);
  } catch (err) {
    // Fallback: try libreoffice directly
    if (ext === '.docx' || ext === '.doc' || ext === '.xlsx' || ext === '.xls' || ext === '.pdf' || ext === '.pptx') {
      return await libreofficeFallback(filePath);
    }
    throw err;
  }
}

/**
 * Fallback conversion using LibreOffice
 */
function libreofficeFallback(filePath) {
  return new Promise((resolve, reject) => {
    const absPath = path.resolve(filePath);
    const outDir = '/tmp/kb_convert';

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    execFile('libreoffice', [
      '--headless', '--convert-to', 'txt:Text',
      '--outdir', outDir, absPath
    ], { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`LibreOffice failed: ${error.message}`));
      }

      // Find the output file
      const baseName = path.basename(absPath, path.extname(absPath));
      const txtPath = path.join(outDir, `${baseName}.txt`);

      // LibreOffice might use different naming for files with dots
      let foundTxt = txtPath;
      if (!fs.existsSync(foundTxt)) {
        // Try to find any .txt file in outDir
        const files = fs.readdirSync(outDir);
        const txtFile = files.find(f => f.endsWith('.txt') && f.startsWith(baseName));
        if (txtFile) {
          foundTxt = path.join(outDir, txtFile);
        } else {
          return reject(new Error('LibreOffice output not found'));
        }
      }

      const content = fs.readFileSync(foundTxt, 'utf-8');
      // Clean up temp file
      try { fs.unlinkSync(foundTxt); } catch(e) {}
      resolve(content);
    });
  });
}

/**
 * Add YAML front matter metadata header to markdown content
 */
function addMetadata(content, title, sourceType, sourcePath) {
  const now = new Date().toISOString().split('T')[0];
  const meta = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `source: "${sourcePath.replace(/"/g, '\\"')}"`,
    `source_type: "${sourceType}"`,
    `created: "${now}"`,
    '---',
    ''
  ].join('\n');

  return meta + content;
}

/**
 * Auto-convert non-markdown files to .md, keeping originals.
 * Returns: path to the .md file, or null if not applicable.
 */
async function autoConvertToMd(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // .md already markdown; .txt also converted to .md for QMD indexing
  if (ext === '.md') {
    return null;
  }

  // Supported conversion types
  const convertibleTypes = new Set(['.docx', '.doc', '.pdf', '.xlsx', '.xls', '.pptx', '.csv', '.html', '.htm', '.txt']);
  if (!convertibleTypes.has(ext)) {
    return null;
  }

  try {
    const content = await toMarkdown(filePath);
    const baseName = path.basename(filePath, ext);
    const mdPath = path.join(path.dirname(filePath), `${baseName}.md`);

    const sourceType = ext.replace('.', '').toUpperCase();
    const title = baseName;
    const contentWithMeta = addMetadata(content, title, sourceType, filePath);

    fs.writeFileSync(mdPath, contentWithMeta, 'utf-8');

    return mdPath;
  } catch (err) {
    console.error(`[convert] autoConvertToMd failed for ${filePath}: ${err.message}`);
    return null;
  }
}

module.exports = { convertWithMarkItDown, toMarkdown, autoConvertToMd, detectCategory };
