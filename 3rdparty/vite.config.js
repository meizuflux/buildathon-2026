import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use the local API unless another backend is explicitly configured.
const target = process.env.HAVEN_API_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': { target, changeOrigin: true } },
  },
})
