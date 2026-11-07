import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The portal has no data of its own: /api goes to the same API the government
// dashboard uses, so both stay in sync.
//   default → the dashboard's dev server (frontend branch, `npm run dev` on :5173),
//             which hosts the shared mock API
//   HAVEN_API_URL=http://127.0.0.1:8000 → the real backend
//   HAVEN_API_URL=http://127.0.0.1:8787 → the standalone mock (`npm run mock-api` in frontend/)
const target = process.env.HAVEN_API_URL || 'http://localhost:5173'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': { target, changeOrigin: true } },
  },
})
