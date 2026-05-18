import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['build/**'],
    setupFiles: ['dotenv/config'],
    env: {
      TEST_MODE: 'true'
    }
  }
});
