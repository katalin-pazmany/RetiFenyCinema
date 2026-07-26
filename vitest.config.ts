import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration test files share one Postgres database and each truncates
    // shared tables in beforeEach; running files in parallel races those
    // deletes against other files' inserts. Serialize file execution so
    // integration tests stay deterministic.
    fileParallelism: false,
  },
});
