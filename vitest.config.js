import { defineConfig } from 'vitest/config';

// Server and helper tests live in test/. The page tests have their own setup in web/.
export default defineConfig({
  test: { include: ['test/**/*.test.js'] },
});
