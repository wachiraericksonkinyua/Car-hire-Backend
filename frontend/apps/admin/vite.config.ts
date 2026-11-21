import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_TARGET__: JSON.stringify('admin'),
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
  },
  publicDir: fileURLToPath(
    new URL('../../packages/frontend/public', import.meta.url),
  ),
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
  },
})
