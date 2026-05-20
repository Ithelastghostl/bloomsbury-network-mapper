import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'design-a-server'),
  server: { port: 5173, host: '0.0.0.0' },
  base: '/a/',
  build: { outDir: resolve(__dirname, 'dist-a'), emptyOutDir: true },
  publicDir: resolve(__dirname, 'public'),
});
