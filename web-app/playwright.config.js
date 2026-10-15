import { defineConfig } from '@playwright/test';
const port = Number(process.env.GROVE_TEST_PORT || 4317);
export default defineConfig({ testDir: './tests/browser', use: { baseURL: `http://127.0.0.1:${port}`, channel: 'chrome', headless: true }, webServer: { command: `PORT=${port} GROVE_ENGINE_PORT=${port + 1} npm run dev`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true }, reporter: 'list' });
