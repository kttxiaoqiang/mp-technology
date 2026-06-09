/**
 * Authentication helper for API tests.
 *
 * Strategy: In test mode (NODE_ENV=test), we inject session state via a
 * test-only route that bypasses the login page.
 *
 * This file sets up a global admin session cookie that can be used
 * by all API test requests.
 */
const { request } = require('@playwright/test');

const TEST_ADMIN = {
  username: 'testadmin',
  password: 'testpass123',
};
const TEST_ENGINEER = {
  username: 'testengineer',
  password: 'testpass456',
};

// Base URL for API requests
const BASE_URL = 'http://localhost:3344';

/**
 * Get an authenticated API request context as admin
 */
async function getAdminContext() {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/auth/login', {
    data: TEST_ADMIN,
  });
  if (!res.ok()) {
    // If login fails (auth not implemented), fall back to test mode
    // by calling a setup endpoint that creates a session
    const setupRes = await ctx.post('/api/test/setup-session', {
      data: { role: 'admin' },
    });
    if (!setupRes.ok()) {
      throw new Error(`Failed to setup admin session: ${setupRes.status()}`);
    }
  }
  return ctx;
}

/**
 * Get an authenticated API request context as engineer
 */
async function getEngineerContext() {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/auth/login', {
    data: TEST_ENGINEER,
  });
  if (!res.ok()) {
    const setupRes = await ctx.post('/api/test/setup-session', {
      data: { role: 'engineer' },
    });
    if (!setupRes.ok()) {
      throw new Error(`Failed to setup engineer session: ${setupRes.status()}`);
    }
  }
  return ctx;
}

/**
 * Get an unauthenticated API request context
 */
async function getUnauthenticatedContext() {
  return await request.newContext({ baseURL: BASE_URL });
}

/**
 * Seed test users into the database (used in beforeAll)
 */
async function seedTestUsers() {
  const bcrypt = require('bcryptjs');
  const { getDb } = require('../lib/database.cjs');
  const db = getDb();

  // Create admin if not exists
  const adminHash = bcrypt.hashSync(TEST_ADMIN.password, 10);
  db.prepare(
    'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(TEST_ADMIN.username, adminHash, 'admin');

  // Create engineer if not exists
  const engHash = bcrypt.hashSync(TEST_ENGINEER.password, 10);
  db.prepare(
    'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(TEST_ENGINEER.username, engHash, 'engineer');

  console.log('[auth.setup] Test users seeded');
}

module.exports = {
  TEST_ADMIN,
  TEST_ENGINEER,
  getAdminContext,
  getEngineerContext,
  getUnauthenticatedContext,
  seedTestUsers,
};
