import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    // In dev, forward API calls to the Fastify server.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
