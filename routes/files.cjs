'use strict';
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../lib/database.cjs');

const DATA_DIR = process.env.KB_DATA_DIR || '/home/zhang/company_knowledge_base';

// 文件列表
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const files = db.prepare('SELECT * FROM files ORDER BY uploaded_at DESC').all();
    res.json({ success: true, files });
  } catch (err) {
    console.error('[files] 获取文件列表失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// FAQ 列表
router.get('/faq', (req, res) => {
  try {
    const db = getDb();
    const faq = db.prepare('SELECT * FROM faq ORDER BY created_at DESC').all();
    res.json({ success: true, faq });
  } catch (err) {
    console.error('[faq] 获取FAQ失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 搜索
router.get('/search', (req, res) => {
  try {
    const q = req.query.q || '';
    const db = getDb();
    const results = db.prepare(
      'SELECT * FROM files WHERE name LIKE ? OR category LIKE ? ORDER BY uploaded_at DESC LIMIT 50'
    ).all(`%${q}%`, `%${q}%`);
    res.json({ success: true, results, query: q });
  } catch (err) {
    console.error('[search] 搜索失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 文件上传
router.post('/upload', (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ success: false, error: '未选择文件' });
    }
    const file = req.files.file;
    const name = Buffer.from(file.name, 'latin1').toString('utf8');
    const originalName = file.originalFilename || name;
    const targetDir = path.join(DATA_DIR, path.dirname(originalName));
    const targetPath = path.join(DATA_DIR, originalName);

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, file.data);

    const db = getDb();
    db.prepare('INSERT INTO files (name, path, category) VALUES (?, ?, ?)').run(
      path.basename(targetPath), originalName, req.query.category || ''
    );

    res.json({ success: true, path: originalName });
  } catch (err) {
    console.error('[upload] 上传失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 文件下载
router.get('/download', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ success: false, error: '缺少path参数' });
    const fullPath = path.join(DATA_DIR, filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ success: false, error: '文件不存在' });
    res.download(fullPath);
  } catch (err) {
    console.error('[download] 下载失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
