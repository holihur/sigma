import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "19123";
const dbName = `sigma_e2e_${Date.now()}_${process.pid}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "bash ../scripts/e2e-server.sh",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      E2E_PORT: port,
      MONGO_URI: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017",
      MONGO_DB: dbName,
      SIGMA_SECRET: process.env.SIGMA_SECRET ?? "sigma-e2e-secret",
      AUTO_UPDATE: "false",
      GO_ENV: "development",
    },
  },
});
