#!/usr/bin/env node
/**
 * 全功能测试 Runner v3
 *
 * 架构:
 *   API 测试 - 每个文件自管理数据库和服务器，用 node --test 并行执行
 *   UI 测试 - 启动一个测试服务器后，Playwright 顺序执行
 *
 * 用法:
 *   node test/run-all.mjs          # 全部
 *   node test/run-all.mjs --api    # 仅 API（并行）
 *   node test/run-all.mjs --ui     # 仅 UI
 *   node test/run-all.mjs --list   # 列出测试
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = __dirname;

// ─── 配置 ───
const TEST_TIMEOUT = 300_000;    // 单个测试最大 5 分钟
const SERVER_PORT  = 36666;
const BASE_URL     = `http://localhost:${SERVER_PORT}`;

// ─── 测试文件清单 ───
// API 测试: 自管理数据库和服务器
// 与当前 server.cjs 兼容的 API 测试
// 注: faq.test.cjs 使用旧 server_v2.cjs，暂不包含
// 注: faq-batch.test.cjs 自 spawn 子进程，需直接 node 跑
const API_TESTS = [
  'database.test.cjs',
  'auth.test.cjs',
  'faq-extract.test.cjs',
  'auto-faq-extract.test.cjs',
  'file-batch.test.cjs',
];

// 自 spawn 子进程的测试（直接 node 跑，不使用 --test）
const SPAWN_API_TESTS = [
  'faq-batch.test.cjs',
];

// 需要测试服务器的 API 测试（依赖测试服务器实例）
const SERVER_API_TESTS = [
  'batch-upload.test.cjs',
];

// UI 测试 (Playwright)
const UI_TESTS = [
  'file-batch-ui.test.mjs',
  'faq-batch-ui.test.mjs',
];

// ─── 颜色 ───
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', N = '\x1b[0m';

// ─── 服务器管理 ───
let serverProcess = null;
let serverDir = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-runner-'));
    fs.mkdirSync(path.join(serverDir, 'kb_data'), { recursive: true });
    console.log(`  ${C}[setup]${N} 临时数据库: ${path.basename(serverDir)}`);
    console.log(`  ${C}[setup]${N} 端口: ${SERVER_PORT}`);

    const env = {
      ...process.env,
      KB_DATA_DIR: serverDir,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'test',
      KB_ADMIN_USER: 'admin',
      KB_ADMIN_PASS: '123456',
    };

    serverProcess = spawn('node', ['server.cjs'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });

    let started = false;
    const timeout = setTimeout(() => { if (!started) reject(new Error('Server timeout')); }, 15000);

    const onData = (d) => {
      if (!started && (d.toString().includes('listening') || d.toString().includes('Server running'))) {
        started = true; clearTimeout(timeout); setTimeout(resolve, 500);
      }
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', onData);
    serverProcess.on('error', (e) => { clearTimeout(timeout); reject(e); });
    serverProcess.on('exit', (c) => { if (!started) { clearTimeout(timeout); reject(new Error(`exit ${c}`)); } });

    const probe = () => {
      const req = http.get(BASE_URL + '/', () => { if (!started) { started = true; clearTimeout(timeout); resolve(); } });
      req.on('error', () => { if (!started) setTimeout(probe, 300); });
      req.end();
    };
    setTimeout(probe, 800);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) { resolve(); return; }
    serverProcess.on('exit', () => {
      try { fs.rmSync(serverDir, { recursive: true, force: true }); } catch {}
      resolve();
    });
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      try { serverProcess.kill('SIGKILL'); } catch {}
      try { fs.rmSync(serverDir, { recursive: true, force: true }); } catch {}
      resolve();
    }, 3000);
  });
}

// ─── 运行并等待单个测试文件 ───
function runOne(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { out += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ code: -1, out, timedOut: true });
    }, opts.timeout || 120000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, timedOut: false });
    });
  });
}

// ─── 解析 node:test 输出 ───
function parseResults(output) {
  let pass = 0, fail = 0;
  for (const line of output.split('\n')) {
    const pm = line.match(/#?\s*pass\s+(\d+)/);
    const fm = line.match(/#?\s*fail\s+(\d+)/);
    if (pm) pass = Math.max(pass, parseInt(pm[1]));
    if (fm) fail = Math.max(fail, parseInt(fm[1]));
  }
  return { pass, fail };
}

// ─── 主流程 ───
async function main() {
  const args = process.argv.slice(2);
  const runApi       = !args.includes('--ui');
  const runUi        = !args.includes('--api');
  const listOnly     = args.includes('--list');
  const serverNeeded = runUi || args.includes('--server');

  if (listOnly) {
    console.log(`${B}API:${N}`); API_TESTS.forEach(f => console.log(`  ${f}`));
    console.log(`${B}Server API:${N}`); SERVER_API_TESTS.forEach(f => console.log(`  ${f}`));
    console.log(`${B}UI:${N}`);  UI_TESTS.forEach(f => console.log(`  ${f}`));
    return;
  }

  const allStart = Date.now();
  let totalPass = 0, totalFail = 0;
  const fails = [];

  console.log(`\n${B}${C}╔════════════════════════════════════╗${N}`);
  console.log(`${B}${C}║   知识库全功能测试 · Regression  ║${N}`);
  console.log(`${B}${C}╚════════════════════════════════════╝${N}\n`);

  // ─── 启动服务器（UI / Server-API 需要） ───
  if (serverNeeded) {
    console.log(`${Y}[setup]${N} 启动测试服务器...`);
    try { await startServer(); console.log(`  ${G}就绪 ✓${N}\n`); }
    catch (e) { console.log(`  ${R}失败: ${e.message}${N}`); process.exit(1); }
  }

  // ─── 自管理 API 测试（并行） ───
  if (runApi && API_TESTS.length > 0) {
    console.log(`${B}${C}── API 测试（自管理） ──${N}\n`);

    for (const file of API_TESTS) {
      const fp = path.join(TEST_DIR, file);
      if (!fs.existsSync(fp)) { console.log(`  ${Y}⚠ 跳过: ${file}${N}`); continue; }
      process.stdout.write(`  ${file} ... `);
      const result = await runOne('node', ['--test', '--test-timeout', String(TEST_TIMEOUT), fp], {
        timeout: TEST_TIMEOUT + 10000,
      });
      const { pass, fail } = parseResults(result.out);
      totalPass += pass; totalFail += fail;
      if (result.timedOut) {
        console.log(`${R}⏱ TIMEOUT${N}`);
        fails.push({ file, pass, fail, timedOut: true });
      } else if (fail > 0) {
        console.log(`${R}❌ ${pass}/${pass+fail}${N}`);
        const errLine = result.out.split('\n').find(l => l.includes('Error:') || l.includes('ERR_ASSERTION'));
        if (errLine) console.log(`      ${R}${errLine.slice(0, 130)}${N}`);
        fails.push({ file, pass, fail });
      } else {
        console.log(`${G}✅ ${pass} pass${N}`);
      }
    }
  }

  // ─── 需要服务器的 API 测试 ───
  if (runApi && serverNeeded && SERVER_API_TESTS.length > 0) {
    console.log(`\n${B}${C}── API 测试（需服务器） ──${N}\n`);
    for (const file of SERVER_API_TESTS) {
      const fp = path.join(TEST_DIR, file);
      if (!fs.existsSync(fp)) { console.log(`  ${Y}⚠ 跳过: ${file}${N}`); continue; }
      process.stdout.write(`  ${file} ... `);
      const result = await runOne('node', [fp], {
        timeout: TEST_TIMEOUT + 10000,
        env: { BASE_URL, NODE_ENV: 'test' },
      });
      const { pass, fail } = parseResults(result.out);
      totalPass += pass; totalFail += fail;
      if (fail > 0) {
        console.log(`${R}❌ ${pass}/${pass+fail}${N}`);
        fails.push({ file, pass, fail, out: result.out });
        const errLine = result.out.split('\n').find(l => l.includes('Error:') || l.includes('ERR_ASSERTION'));
        if (errLine) console.log(`      ${R}${errLine.slice(0, 130)}${N}`);
      } else {
        console.log(`${G}✅ ${pass} pass${N}`);
      }
    }
  }

  // ─── 自 spawn 子进程的 API 测试 ───
  if (runApi && SPAWN_API_TESTS.length > 0) {
    console.log(`\n${B}${C}── API 测试（自 spawn） ──${N}\n`);
    for (const file of SPAWN_API_TESTS) {
      const fp = path.join(TEST_DIR, file);
      if (!fs.existsSync(fp)) { console.log(`  ${Y}⚠ 跳过: ${file}${N}`); continue; }
      process.stdout.write(`  ${file} ... `);
      const result = await runOne('node', [fp], {
        timeout: 180000,
      });
      const passCount = result.code === 0 ? 1 : 0;
      totalPass += passCount;
      totalFail += passCount ? 0 : 1;
      if (result.code === 0) {
        console.log(`${G}✅${N}`);
      } else {
        console.log(`${R}❌${N}`);
        fails.push({ file, pass: 0, fail: 1 });
      }
    }
  }

  // ─── UI 测试 ───
  if (runUi && serverNeeded) {
    console.log(`\n${B}${C}── UI 测试（Playwright） ──${N}\n`);
    for (const file of UI_TESTS) {
      const fp = path.join(TEST_DIR, file);
      if (!fs.existsSync(fp)) { console.log(`  ${Y}⚠ 跳过: ${file}${N}`); continue; }
      process.stdout.write(`  ${file} ... `);
      const result = await runOne('node', [fp], {
        timeout: 120000,
        env: { BASE_URL, PLAYWRIGHT_BROWSERS_PATH: '0' },
      });
      // UI 测试用自建的 ✅/❌，countResults 可能不准，用 exit code
      const passed = result.code === 0;
      totalPass += passed ? 1 : 0;
      totalFail += passed ? 0 : 1;
      if (passed) {
        console.log(`${G}✅${N}`);
      } else {
        console.log(`${R}❌${N}`);
        fails.push({ file, pass: 0, fail: 1, out: result.out });
        const errLines = result.out.split('\n').filter(l => l.includes('❌') || l.includes('Error'));
        errLines.slice(0, 3).forEach(l => console.log(`      ${R}${l.slice(0, 130)}${N}`));
      }
    }
  }

  await stopServer();

  const elapsed = ((Date.now() - allStart) / 1000).toFixed(1);
  console.log(`\n${B}${C}════════════════════════════════════${N}`);
  console.log(`${B}${C}  耗时 ${elapsed}s  · ${G}${totalPass} pass${N}${totalFail > 0 ? `  ${R}${totalFail} fail${N}` : ''}`);
  console.log(`${B}${C}════════════════════════════════════${N}`);

  if (fails.length > 0) {
    console.log(`\n${R}${B}失败清单:${N}`);
    // 输出完整错误详情
    for (const f of fails) {
      console.log(`  ${R}• ${f.file}${N}`);
      if (f.out) {
        const relevant = f.out.split('\n').filter(l =>
          l.includes('not ok') || l.includes('FAIL') || l.includes('AssertionError') ||
          (l.includes('Error') && !l.includes('node:test') && !l.includes('ERR'))
        ).slice(0, 4);
        for (const l of relevant) console.log(`    ${R}${l.slice(0, 150)}${N}`);
      }
    }
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${R}FATAL:${N}`, err.message);
  stopServer().then(() => process.exit(1));
});
