import { defineConfig, devices } from '@playwright/test';

// Runs against a dedicated local stack on non-default ports, backed by the
// smi_test database — never the docker-compose stack on 3000/5173, which is
// the live deployed instance (see DEPLOY.md). smi_test already exists,
// migrated + seeded, because the backend's own Vitest suite uses it too.
const API_PORT = 3901;
const WEB_PORT = 5901;
const TEST_DATABASE_URL = 'postgresql://smi:smi_dev_password@localhost:5432/smi_test?schema=public';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 'list' for terminal output (this box has no GUI); html report still
  // written to disk for failures, but never auto-opened — inspect it with
  // `npx playwright show-report --host 0.0.0.0` and an SSH tunnel if needed.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../server',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: TEST_DATABASE_URL,
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: '../client',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        VITE_API_BASE_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
