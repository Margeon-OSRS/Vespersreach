/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// base './' makes the build relocatable so it works at any GitHub Pages path.
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@data': fileURLToPath(new URL('./data', import.meta.url)),
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
    },
  },
  build: { outDir: 'dist', target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
