import { defineConfig } from 'vitest/config'

// Unit tests for pure frontend logic. Tauri APIs are mocked per test with
// vi.mock('@tauri-apps/api/…'); nothing here needs a real WebView.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
