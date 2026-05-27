// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: path.join(__dirname, 'specs'),
  outputDir: path.join(__dirname, 'test-results'),

  timeout: 30000,
  expect: { timeout: 5000 },

  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'report'), open: 'never' }],
  ],

  use: {
    baseURL: process.env.VOI_E2E_BASE_URL || 'https://fry.farm',
    actionTimeout: 5000,
    navigationTimeout: 15000,

    screenshot: 'only-on-failure',
    trace: 'on-first-retry',

    // Clean browser state — mocks inject their own localStorage
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
