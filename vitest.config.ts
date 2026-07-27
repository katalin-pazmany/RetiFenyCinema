import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirror the `@/*` path alias from tsconfig.json so tests can import modules
  // under `app/` (route handlers, server actions), which use it.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Integration test files share one Postgres database and each truncates
    // shared tables in beforeEach; running files in parallel races those
    // deletes against other files' inserts. Serialize file execution so
    // integration tests stay deterministic.
    fileParallelism: false,
  },
});
