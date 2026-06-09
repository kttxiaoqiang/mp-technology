/**
 * 日志服务 - 审计日志写入与查询
 */
const { getDb } = require('./database.cjs');

const ACTIONS = {
  login: '登录',
  upload: '上传文档',
  delete: '删除文档',
  add_user: '添加用户',
  delete_user: '删除用户'
};

function log(userId, action, detail) {
  const db = getDb();
  const detailStr = typeof detail === 'object' ? JSON.stringify(detail) : String(detail || '');
  db.prepare('INSERT INTO logs (user_id, action, detail) VALUES (?, ?, ?)').run(userId, action, detailStr);
}

function getLogs(days = 30, limit = 100, offset = 0) {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(
    'SELECT l.*, u.username FROM logs l LEFT JOIN users u ON l.user_id = u.id WHERE l.created_at >= ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?'
  ).all(since, limit, offset);
  return rows.map(r => ({ ...r, action_label: ACTIONS[r.action] || r.action }));
}

function cleanOldLogs() {
  const db = getDb();
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM logs WHERE created_at < ?').run(sixMonthsAgo);
  return result.changes;
}

module.exports = { log, getLogs, cleanOldLogs, ACTIONS };
