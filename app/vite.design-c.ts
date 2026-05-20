import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'design-c-server'),
  server: { port: 5175, host: '0.0.0.0' },
  base: '/c/',
  build: { outDir: resolve(__dirname, 'dist-c'), emptyOutDir: true },
  publicDir: resolve(__dirname, 'public'),
});
