import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    // In dev, forward API calls to the Fastify server.
    // API_PORT=3001 npm run dev  points the dev server at the mock backend.
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? 3000}` },
  },
});
