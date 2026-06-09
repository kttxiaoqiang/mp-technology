/**
 * auth.cjs 单元测试
 *
 * Cycle 1: 认证中间件测试（不依赖 HTTP）
 *   - isAuthenticated: 有 session 放行，无 session 401/redirect
 *   - requireRole: 角色匹配放行，不匹配 403
 *   - getCurrentUser: 返回 session 用户信息
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// 模拟 Express req/res/next
function mockReq(session) {
  const req = { session: session || null, path: '/api/some' };
  return req;
}
function mockRes() {
  const res = {};
  res.status = (code) => { res._status = code; return res; };
  res.json = (data) => { res._json = data; return res; };
  res.redirect = (url) => { res._redirect = url; return res; };
  return res;
}

const { isAuthenticated, requireRole, getCurrentUser } = require('../lib/auth.cjs');

// ─── isAuthenticated ─────────────────────────────
it('isAuthenticated: 有 session 时放行', () => {
  const req = mockReq({ userId: 1, username: 'admin', role: 'admin' });
  const res = mockRes();
  let calledNext = false;
  isAuthenticated(req, res, () => { calledNext = true; });
  assert.equal(calledNext, true, '应调用 next()');
});

it('isAuthenticated: 无 session 时 API 请求返回 401', () => {
  const req = mockReq(null); // path = /api/some
  const res = mockRes();
  isAuthenticated(req, res, () => { assert.fail('不应调用 next'); });
  assert.equal(res._status, 401, '状态码应为 401');
  assert.equal(res._json.error, '未登录');
});

it('isAuthenticated: 无 session 时非 API 请求重定向', () => {
  const req = { session: null, path: '/files' };
  const res = mockRes();
  isAuthenticated(req, res, () => { assert.fail('不应调用 next'); });
  assert.equal(res._redirect, '/login', '应重定向到 /login');
});

it('isAuthenticated: session 无 userId 时视为未认证', () => {
  const req = mockReq({ someData: true });
  const res = mockRes();
  isAuthenticated(req, res, () => { assert.fail('不应调用 next'); });
  assert.equal(res._status, 401);
});

// ─── requireRole ─────────────────────────────────
it('requireRole: 角色匹配时放行', () => {
  const req = mockReq({ userId: 1, role: 'admin' });
  const res = mockRes();
  let calledNext = false;
  const middleware = requireRole('admin');
  middleware(req, res, () => { calledNext = true; });
  assert.equal(calledNext, true);
});

it('requireRole: 角色不匹配时返回 403', () => {
  const req = mockReq({ userId: 2, role: 'engineer' });
  const res = mockRes();
  const middleware = requireRole('admin');
  middleware(req, res, () => { assert.fail('不应调用 next'); });
  assert.equal(res._status, 403);
  assert.equal(res._json.error, '权限不足');
});

it('requireRole: 支持多角色（任意匹配即可放行）', () => {
  const req = mockReq({ userId: 3, role: 'editor' });
  const res = mockRes();
  let calledNext = false;
  const middleware = requireRole('admin', 'editor');
  middleware(req, res, () => { calledNext = true; });
  assert.equal(calledNext, true);
});

it('requireRole: 无 session 时返回 401', () => {
  const req = mockReq(null);
  const res = mockRes();
  const middleware = requireRole('admin');
  middleware(req, res, () => { assert.fail('不应调用 next'); });
  assert.equal(res._status, 401);
});

// ─── getCurrentUser ──────────────────────────────
it('getCurrentUser: 返回 id/username/role', () => {
  const req = mockReq({ userId: 1, username: 'test', role: 'admin' });
  const user = getCurrentUser(req);
  assert.deepEqual(user, { id: 1, username: 'test', role: 'admin' });
});

it('getCurrentUser: 无 session 时返回 null', () => {
  const req = mockReq(null);
  assert.equal(getCurrentUser(req), null);
});

it('getCurrentUser: session 无 userId 时返回 null', () => {
  const req = { session: { some: 'data' } };
  assert.equal(getCurrentUser(req), null);
});
