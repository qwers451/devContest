import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.ts',
    coverage: {
      provider: 'v8',
      // Only measure business-logic (stores); pages/components require full rendering tests
      include: ['src/store/**'],
      reporter: ['text'],
      thresholds: { lines: 90, statements: 90, branches: 80, functions: 90 },
    },
  },
})
