// Shared mock API server: the Part 1 + Part 2 REST contract over HTTP, backed by
// src/api/mock.js with state persisted to a JSON file. The government dashboard
// and the partner portal both talk to it, so changes in one show up in the other.
//
// It runs inside the dashboard's Vite dev server at /api (see vite.config.js),
// or standalone with `npm run mock-api`. Credentials here are fictional demo
// values for the mock only; the real backend never sees them.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ApiError } from '../src/api/live.js'
import { configureMock, mockApi, resetMockData, OPERATOR_VIEW } from '../src/api/mock.js'

export const DEMO_PASSWORD = 'haven-demo'
const SESSION_MS = 24 * 3600_000

const hash = (password, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(password, salt, 32).toString('hex') })
const verify = (password, user) => crypto.timingSafeEqual(Buffer.from(crypto.scryptSync(password, user.salt, 32).toString('hex')), Buffer.from(user.hash))
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex')

function seedAuth() {
  const user = (id, email, role) => ({ id, email, role, ...hash(DEMO_PASSWORD), must_change_password: false })
  return {
    users: [
      user('user_mock_operator', 'government@demo.example', 'operator'),
      user('user_partner_bayside', 'bayside@demo.example', 'partner'),
      user('user_partner_stluke', 'stluke@demo.example', 'partner'),
    ],
    sessions: [],
  }
}

export function createMockApi({ file = path.resolve('.mock-db.json') } = {}) {
  let state = {}
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    /* fresh start */
  }
  state.auth ||= seedAuth()
  const persist = () => fs.writeFileSync(file, JSON.stringify(state))
  configureMock({ latency: 0, storage: { load: () => state.db, save: (db) => { state.db = db; persist() } } })
  persist()

  const auth = () => state.auth
  function userView(u) {
    if (u.role !== 'partner') return { id: u.id, role: u.role, family_id: null, email: u.email }
    const acct = mockApi._partnerAccount(u.id)
    return { id: u.id, role: 'partner', family_id: null, email: u.email, must_change_password: u.must_change_password, site: acct && { ...acct.site, name: mockApi._siteName(acct.site) } }
  }
  function authenticate(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')
    const s = m && auth().sessions.find((x) => x.token_hash === sha(m[1]) && new Date(x.expires_at) > new Date())
    const u = s && auth().users.find((x) => x.id === s.user_id)
    if (!u) throw new ApiError(401, 'unauthorized', 'Authentication required.')
    if (u.role === 'partner') {
      const acct = mockApi._partnerAccount(u.id)
      if (!acct || acct.status !== 'active') throw new ApiError(401, 'account_disabled', 'This portal login has been disabled.')
      return { user: u, token_hash: s.token_hash, as: { role: 'partner', user_id: u.id, name: u.email, site: acct.site } }
    }
    return { user: u, token_hash: s.token_hash, as: { ...OPERATOR_VIEW, user_id: u.id, name: u.email } }
  }
  const operatorOnly = (ctx) => {
    if (ctx.as.role !== 'operator') throw new ApiError(403, 'not_permitted', 'Operators only.')
  }

  // [method, pattern, handler(ctx, params, query, body)] — ctx is null for public routes.
  const routes = [
    ['GET', '/health', () => ({ status: 'ok', mock: true }), { public: true }],
    ['POST', '/auth/login', async (_, __, ___, body) => {
      const email = String(body?.email || '').trim().toLowerCase()
      const u = auth().users.find((x) => x.email === email)
      if (!u || !body?.password || !verify(body.password, u)) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.')
      if (u.role === 'partner') {
        const acct = mockApi._partnerAccount(u.id)
        if (!acct || acct.status !== 'active') throw new ApiError(403, 'account_disabled', 'This portal login has been disabled. Contact your operations center.')
        mockApi._touchLogin(u.id)
      }
      const token = crypto.randomBytes(32).toString('base64url')
      const expires_at = new Date(Date.now() + SESSION_MS).toISOString()
      auth().sessions.push({ token_hash: sha(token), user_id: u.id, expires_at })
      persist()
      return { access_token: token, token_type: 'Bearer', expires_at, user: userView(u) }
    }, { public: true }],
    ['POST', '/auth/logout', (ctx) => {
      auth().sessions = auth().sessions.filter((s) => s.token_hash !== ctx.token_hash)
      persist()
      return null
    }],
    ['POST', '/auth/change-password', (ctx, _, __, body) => {
      if (!verify(String(body?.current_password || ''), ctx.user)) throw new ApiError(400, 'invalid_credentials', 'Current password is incorrect.')
      if (String(body?.new_password || '').length < 8) throw new ApiError(400, 'invalid_request', 'New password must be at least 8 characters.')
      Object.assign(ctx.user, hash(body.new_password), { must_change_password: false })
      persist()
      return null
    }],
    ['GET', '/me', (ctx) => userView(ctx.user)],
    ['POST', '/_mock/reset', (ctx) => {
      operatorOnly(ctx)
      resetMockData()
      state.auth = seedAuth()
      persist()
      return null
    }],

    ['GET', '/disasters', () => mockApi.listDisasters().then((disasters) => ({ disasters }))],
    ['GET', '/shelters', (ctx, _, q) => mockApi.listShelters(q.disaster_id, ctx.as).then((shelters) => ({ shelters }))],
    ['POST', '/shelters', (ctx, _, __, b) => mockApi.createShelter(b, ctx.as), { status: 201 }],
    ['PATCH', '/shelters/:id', (ctx, p, __, b) => mockApi.updateShelter(p.id, b, ctx.as)],
    ['GET', '/disasters/:id/updates', (ctx, p) => mockApi.listUpdates(p.id, ctx.as).then((updates) => ({ updates }))],
    ['POST', '/disasters/:id/updates', (ctx, p, __, b) => mockApi.publishUpdate(p.id, b, ctx.as), { status: 201 }],
    ['POST', '/disasters/:id/updates/preview', (ctx, p, __, b) => mockApi.previewUpdate(p.id, b, ctx.as)],
    ['PATCH', '/updates/:id', (ctx, p) => mockApi.retractUpdate(p.id, ctx.as)],
    ['GET', '/disasters/:id/reports', (ctx, p) => mockApi.listReports(p.id, ctx.as).then((reports) => ({ reports }))],
    ['GET', '/disasters/:id/activity', (ctx, p) => mockApi.listActivity(p.id, ctx.as).then((activity) => ({ activity }))],

    ['GET', '/resource-types', () => mockApi.listResourceTypes().then((resource_types) => ({ resource_types }))],
    ['GET', '/organizations', (ctx, _, q) => mockApi.listOrganizations(q.disaster_id, ctx.as).then((organizations) => ({ organizations }))],
    ['POST', '/organizations', (ctx, _, __, b) => mockApi.createOrganization(b, ctx.as), { status: 201 }],
    ['PATCH', '/organizations/:id', (ctx, p, __, b) => mockApi.updateOrganization(p.id, b, ctx.as)],
    ['PATCH', '/organizations/:id/inventory', (ctx, p, __, b) => mockApi.setInventory(p.id, b?.items || [], ctx.as).then((items) => ({ items }))],
    ['GET', '/inventory', (ctx, _, q) => mockApi.listInventory(q.disaster_id, ctx.as).then((items) => ({ items }))],
    ['GET', '/needs', (ctx, _, q) => mockApi.listNeeds(q.disaster_id, ctx.as).then((needs) => ({ needs }))],
    ['POST', '/needs', (ctx, _, __, b) => mockApi.createNeed(b, ctx.as), { status: 201 }],
    ['PATCH', '/needs/:id', (ctx, p, __, b) => mockApi.updateNeed(p.id, b, ctx.as)],
    ['GET', '/shipments', (ctx, _, q) => mockApi.listShipments(q.disaster_id, ctx.as).then((shipments) => ({ shipments }))],
    ['POST', '/shipments', (ctx, _, __, b) => mockApi.createShipment(b, ctx.as), { status: 201 }],
    ['PATCH', '/shipments/:id', (ctx, p, __, b) => mockApi.updateShipment(p.id, b, ctx.as)],
    ['GET', '/conversations', (ctx, _, q) => mockApi.listConversations(q.disaster_id, ctx.as).then((conversations) => ({ conversations }))],
    ['POST', '/conversations', (ctx, _, __, b) => mockApi.createConversation(b, ctx.as), { status: 201 }],
    ['GET', '/conversations/:id/messages', (ctx, p) => mockApi.listMessages(p.id, ctx.as).then((messages) => ({ messages }))],
    ['POST', '/conversations/:id/messages', (ctx, p, __, b) => mockApi.sendMessage(p.id, b?.body, ctx.as), { status: 201 }],
    ['POST', '/conversations/:id/read', (ctx, p) => mockApi.markConversationRead(p.id, ctx.as)],

    ['GET', '/assistance-requests', (ctx, _, q) => mockApi.listAssistanceRequests(q.disaster_id, ctx.as).then((requests) => ({ requests }))],
    ['POST', '/assistance-requests/:id/claim', (ctx, p, __, b) => mockApi.claimAssistanceRequest(p.id, b || {}, ctx.as)],
    ['PATCH', '/assistance-requests/:id', (ctx, p, __, b) => mockApi.updateAssistanceRequest(p.id, b || {}, ctx.as)],

    ['GET', '/partner-accounts', (ctx, _, q) => mockApi.listPartnerAccounts(q.disaster_id, ctx.as).then((accounts) => ({ accounts }))],
    ['POST', '/partner-accounts', async (ctx, _, __, b) => {
      operatorOnly(ctx)
      const email = String(b?.email || '').trim().toLowerCase()
      if (auth().users.some((u) => u.email === email)) throw new ApiError(409, 'email_in_use', 'An account with this email already exists.')
      const created = await mockApi.createPartnerAccount(b, ctx.as)
      auth().users.push({ id: created.account.id, email: created.account.email, role: 'partner', ...hash(created.temporary_password), must_change_password: true })
      persist()
      return created
    }, { status: 201 }],
    ['PATCH', '/partner-accounts/:id', async (ctx, p, __, b) => {
      const acct = await mockApi.updatePartnerAccount(p.id, b || {}, ctx.as)
      if (acct.status === 'disabled') auth().sessions = auth().sessions.filter((s) => s.user_id !== p.id)
      persist()
      return acct
    }],
    ['POST', '/partner-accounts/:id/reset-password', async (ctx, p) => {
      const out = await mockApi.resetPartnerPassword(p.id, ctx.as)
      const u = auth().users.find((x) => x.id === p.id)
      if (u) Object.assign(u, hash(out.temporary_password), { must_change_password: true })
      auth().sessions = auth().sessions.filter((s) => s.user_id !== p.id)
      persist()
      return out
    }],
  ].map(([method, pattern, fn, opts = {}]) => ({
    method, fn, ...opts,
    re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`),
  }))

  const send = (res, status, body) => {
    res.statusCode = status
    if (body === null || body === undefined) return res.end()
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  // Connect-style middleware: (req, res, next). Handles /api/* (or /* when mounted at /api).
  return async function handle(req, res, next) {
    const url = new URL(req.originalUrl || req.url, 'http://mock')
    const p = url.pathname.replace(/^\/api(?=\/)/, '')
    const route = routes.find((r) => r.method === req.method && r.re.test(p))
    if (!route) {
      if (next && !url.pathname.startsWith('/api')) return next()
      return send(res, routes.some((r) => r.re.test(p)) ? 405 : 404, { error: { code: 'not_found', message: `${req.method} /api${p} is not implemented by the mock server.` } })
    }
    try {
      let body
      if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
        const chunks = []
        for await (const c of req) chunks.push(c)
        const raw = Buffer.concat(chunks).toString('utf8')
        body = raw ? JSON.parse(raw) : {}
      }
      const ctx = route.public ? null : authenticate(req)
      const params = Object.fromEntries(Object.entries(p.match(route.re).groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]))
      const out = await route.fn(ctx, params, Object.fromEntries(url.searchParams), body)
      send(res, out === null ? 204 : route.status || 200, out)
    } catch (e) {
      if (e instanceof ApiError) return send(res, e.status, { error: { code: e.code, message: e.message } })
      if (e instanceof SyntaxError) return send(res, 400, { error: { code: 'invalid_request', message: 'Body must be JSON.' } })
      console.error('[mock-api]', e)
      send(res, 500, { error: { code: 'server_error', message: 'Internal server error.' } })
    }
  }
}
