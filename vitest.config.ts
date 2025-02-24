/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@modelcontextprotocol/sdk/dist/esm/client': path.resolve(
        __dirname,
        'node_modules/@modelcontextprotocol/sdk/dist/esm/client'
      ),
      '@modelcontextprotocol/sdk/dist/esm/transport': path.resolve(
        __dirname,
        'node_modules/@modelcontextprotocol/sdk/dist/esm/transport'
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/**/types.ts',
        'src/index.ts',
      ],
    },
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1,
      },
    },
  },
});
