import { defineConfig, devices } from '@playwright/test';

// Needs both servers running: `npm run dev:api` (Worker + local D1) and `npm run dev` (Vite).
export default defineConfig({
  testDir: 'e2e',
  timeout: 400_000,
  outputDir: 'e2e-results',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:5173',
    ...devices['Pixel 7'],
    actionTimeout: 10_000,
  },
});
