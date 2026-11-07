import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API modes (dev):
//   default            → the shared mock API runs inside this dev server at /api
//                        (the partner portal proxies here too, so both stay in sync)
//   HAVEN_API_URL=...  → proxy /api to that backend instead (e.g. http://127.0.0.1:8000)
//   VITE_USE_MOCK=true → no server at all; the dashboard keeps mock data in the browser
const backend = process.env.HAVEN_API_URL
const sharedMock = !backend && process.env.VITE_USE_MOCK !== 'true'

const mockApiPlugin = {
  name: 'haven-mock-api',
  async configureServer(server) {
    const { createMockApi, DEMO_PASSWORD } = await import('./mock-server/handler.js')
    const handle = createMockApi()
    server.middlewares.use('/api', (req, res, next) => handle(req, res, next))
    server.httpServer?.once('listening', () => {
      console.log(`\n  Haven mock API at /api — demo password "${DEMO_PASSWORD}" for government@ / bayside@ / stluke@demo.example\n`)
    })
  },
}

export default defineConfig({
  plugins: [react(), ...(sharedMock ? [mockApiPlugin] : [])],
  define: { 'import.meta.env.VITE_SHARED_MOCK': JSON.stringify(sharedMock ? 'true' : 'false') },
  server: {
    port: 5173,
    proxy: backend ? { '/api': { target: backend, changeOrigin: true } } : undefined,
  },
})
