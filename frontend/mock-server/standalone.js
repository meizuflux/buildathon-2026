// Run the shared mock API on its own port (default 8787), e.g. when the
// partner portal is used without the dashboard's dev server running.
import http from 'node:http'
import { createMockApi, DEMO_PASSWORD } from './handler.js'

const port = Number(process.env.PORT || 8787)
const handle = createMockApi()
http.createServer((req, res) => handle(req, res)).listen(port, () => {
  console.log(`Haven mock API on http://127.0.0.1:${port}/api`)
  console.log(`Demo logins (password "${DEMO_PASSWORD}"): government@demo.example, bayside@demo.example, stluke@demo.example`)
})
