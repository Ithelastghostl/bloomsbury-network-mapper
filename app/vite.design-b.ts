import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'design-b-server'),
  server: { port: 5174, host: '0.0.0.0' },
  base: '/b/',
  build: { outDir: resolve(__dirname, 'dist-b'), emptyOutDir: true },
  publicDir: resolve(__dirname, 'public'),
});
