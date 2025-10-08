import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    open: true,
    hmr: {
      host: '127.0.0.1',
      port: 3000
    }
  }
});
