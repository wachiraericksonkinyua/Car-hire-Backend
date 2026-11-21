import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_TARGET__: JSON.stringify('web'),
  },
  publicDir: fileURLToPath(
    new URL('../../packages/frontend/public', import.meta.url),
  ),
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
})
