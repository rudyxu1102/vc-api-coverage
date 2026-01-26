import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['examples/**/*', 'node_modules/**/*', 'test/fixtures/**/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'examples/**',
        'node_modules/**',
        'test/**',
        '**/*.d.ts',
        'vitest.config.ts',
        'eslint.config.mjs',
      ],
    },
  },
}) 