import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages project sites,
// custom domains, and a plain nginx directory without reconfiguration.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
