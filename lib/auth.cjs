/**
 * 认证中间件
 * 依赖 database.cjs 的 getDb()
 */
const { getDb } = require('./database.cjs');

/**
 * 检查用户是否已认证
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  // API 请求返回 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: '未登录' });
  }
  // 页面请求重定向
  res.redirect('/login');
}

/**
 * 角色验证中间件
 * @param  {...string} roles 允许的角色列表
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: '未登录' });
      }
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

/**
 * 获取当前登录用户信息
 */
function getCurrentUser(req) {
  if (!req.session || !req.session.userId) return null;
  return {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role
  };
}

module.exports = { isAuthenticated, requireRole, getCurrentUser };
