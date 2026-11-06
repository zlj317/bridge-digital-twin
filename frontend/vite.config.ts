import { defineConfig } from 'vite';

const SHM = 'http://localhost:8082';
const BRIDGE = 'http://localhost:8081';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '^/api/v1/(points|alarms|history|metrics)': { target: SHM, changeOrigin: true },
      '^/q/health': { target: SHM, changeOrigin: true },
      '^/api/v1/': { target: BRIDGE, changeOrigin: true },
      '/mqtt': { target: 'ws://localhost:8083', ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
});
