// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'test-results/report' }],
    ['list']
  ],
  // Timeout per test
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  // Shared project options
  use: {
    baseURL: 'http://localhost:3344',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Auto-start the server
  webServer: {
    command: 'node server.cjs',
    url: 'http://localhost:3344/api/files',
    reuseExistingServer: true,
    timeout: 15000,
    cwd: __dirname,
    env: {
      NODE_ENV: 'test',
      PORT: '3344',
    },
  },
  // Define projects
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      testMatch: '*.test.cjs',
    },
    {
      name: 'e2e-chromium',
      testDir: './tests/e2e',
      testMatch: '*.test.cjs',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'zh-CN',
      },
    },
  ],
});
