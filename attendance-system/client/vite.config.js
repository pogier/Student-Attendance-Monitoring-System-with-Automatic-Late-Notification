import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API server runs on 5000. We proxy /api and /socket.io from the Vite dev
// server so the browser only ever talks to one origin (no CORS pain, and the
// sandbox live-preview host works without extra config).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true
      }
    }
  }
});
