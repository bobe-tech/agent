import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // The shared .env lives in the repo root (vite root = front/); we also read VITE_* variables from there
  // for substitution in index.html (e.g. %VITE_APP_URL% in og:image).
  envDir: fileURLToPath(new URL('../', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: {
        // lightweight-charts is loaded only on the chart page and rarely changes —
        // we split it into a separate chunk so it can be cached independently of the main bundle.
        manualChunks: {
          'lightweight-charts': ['lightweight-charts'],
        },
      },
    },
  },
});
