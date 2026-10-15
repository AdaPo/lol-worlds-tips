import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// UI tests: the real Svelte app rendered in a fake browser (jsdom).
export default defineConfig({
  plugins: [svelte()],
  // Use Svelte's browser build so `mount` works.
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.js'],
  },
});
