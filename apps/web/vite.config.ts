import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const target = process.env.APP_TARGET === 'admin' ? 'admin' : 'web'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_TARGET__: JSON.stringify(target),
  },
  server: {
    port: target === 'admin' ? 5174 : 5173,
  },
  build: {
    outDir: `dist/${target}`,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
