import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.E2E_API_PORT ?? 3011);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3010);
const apiBase = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start -w @comacoffe/api",
      url: `${apiBase}/health`,
      cwd: "../..",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(apiPort),
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://comacoffe:comacoffe@127.0.0.1:5432/comacoffe",
        JWT_SECRET:
          process.env.JWT_SECRET ?? "e2e-test-jwt-secret-key-minimum-32-chars",
        ENABLE_DEV_ROUTES: "true",
        ENABLE_QRIS_STAGING_FALLBACK: "true",
        FRONTEND_URL: `http://127.0.0.1:${webPort}`,
        CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
      },
    },
    {
      command: "npm run start -w @comacoffe/web",
      url: `http://127.0.0.1:${webPort}/login`,
      cwd: "../..",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: String(webPort),
        NEXT_PUBLIC_API_BASE_URL: apiBase,
      },
    },
  ],
});
