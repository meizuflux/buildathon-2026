import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend (Litestar) has no CORS config, so the dev server proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.HAVEN_API_URL || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
