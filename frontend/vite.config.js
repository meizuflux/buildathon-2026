import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dashboard talks to the backend by default. Override for another host.
const backend = process.env.HAVEN_API_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: backend, changeOrigin: true } },
  },
})
