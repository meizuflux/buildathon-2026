# Haven Operations — government dashboard

A React + Vite dashboard that lets government operators run a disaster response: shelters, communications, and resource logistics, across multiple pages.

## Pages

| Page | Route | What operators do there |
|---|---|---|
| **Command Center** | `/` | Read key figures (people sheltered, spaces free, help requests, open needs, shipments, unread messages). Work through a ranked **needs attention** queue: unanswered help requests, uncovered critical needs, late shipments, shelters nearly full, shelters gone quiet, unread messages. Follow the live activity timeline. See supply coverage and how far recent broadcasts have reached. |
| **Operations Map** | `/map` | See shelters (coloured by space), organizations, active shipment routes and family reports, each as a layer you can toggle. Add or edit shelters and click the map to place them. Review family reports and reply to them. |
| **Broadcasts** | `/comms/broadcasts` | Send official updates using templates (evacuation, shelter in place, boil water…). **Target an area** (a radius drawn on a map, optionally centred on a shelter) and **an audience** (no car, medication, accessibility, children, pets). A live recipient estimate updates as you adjust. Messages can be scheduled and set to expire. The history shows read rates and lets you retract a broadcast. |
| **Messages** | `/comms/messages` | Direct threads with shelters, organizations and families: unread state, quick replies, and contact details. From a thread you can "Send resources" (which posts the ETA into the thread) or "Log need". |
| **Needs** | `/logistics/needs` | Every resource need, showing received / on the way / uncovered. **Suggested sources** are ranked by spare stock and distance, with one-click dispatch. Shelter shortages that have no logged need are flagged. You can change priority, mark a need fulfilled, or cancel it. |
| **Dispatch** | `/logistics/dispatch` | A shipment board: Requested → Approved → In transit → Delivered. Late shipments are flagged. Approving reserves stock; departing deducts it; delivering fills the linked needs. |
| **Inventory** | `/logistics/inventory` | A grid of resources against organizations, with total spare stock, open demand, amount on the way, and whether each resource is short. |
| **Citizen requests** | `/citizens` | Requests from households who can't reach an aid location (supply delivery, transport, medical, welfare check), on a map and in a list. Each request shows full household details, consent status, which organization accepted it, and its history. Operators can assign a request to an approved organization (ranked by distance and whether it stocks the items), unassign, reprioritize, close, add government-only notes, or message the household. Households without consent are flagged **government only**. Each organization page has a **Citizen assistance** approval toggle. |
| **Portal access** | `/partners` | Every partner portal login (shelters and organizations). Create logins (a temporary password is shown once, with a copyable invite), reset passwords, disable or enable access, see last sign-in, and spot sites that have no login yet. Each organization page also has its own **Partner portal access** card, and **Add organization** can create a login in the same step. |
| **Organizations** | `/organizations`, `/organizations/:id` | A directory you can filter by type and service. Each detail page has editable stock counts, open needs, shipment history, status, contact details, a coverage map, and buttons to message, log a need, or dispatch from that organization. |

All data refreshes every 12 seconds. Most items link through to related pages.

## Run

Needs Node 20+.

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Data sources

| How you start it | Where `/api` goes | Use it for |
|---|---|---|
| `npm run dev` (default) | A **shared mock API** that runs inside this dev server and saves to `frontend/.mock-db.json` | Demos with the partner portal. Both apps read and write the same data. |
| `HAVEN_API_URL=http://127.0.0.1:8000 npm run dev` | The real backend, through the dev proxy | Integration once the backend implements the endpoints |
| `VITE_USE_MOCK=true npm run dev` | Nothing. Data stays in the browser only. | A static demo with no server |

The shared mock (`mock-server/handler.js`) serves the Part 1 + Part 2 contract over HTTP, including the partner role and its permissions (§10). Its logic lives in `src/api/mock.js`. Seeded logins all use the password **`haven-demo`**. These are fictional mock-only accounts; the real backend never sees them.

| Email | Role |
|---|---|
| `government@demo.example` | Operator (this dashboard) |
| `bayside@demo.example` | Partner: Bayside Food Bank (organization) |
| `stluke@demo.example` | Partner: St. Luke Medical Annex (shelter) |

Use **"Shared demo data ↺"** in the top bar to reset both apps to the seed. This also removes any logins you created and signs everyone out.

To run the mock without the dashboard (for example, portal-only work), use `npm run mock-api`. It serves the same API on port 8787.

### Partner portal

The portal for shelters and relief organizations is on the **`3rdparty` branch**, in the `3rdparty/` folder. With this dev server running, start the portal (`cd 3rdparty && npm install && npm run dev`) and open http://localhost:5174. It proxies `/api` here, so anything a partner does shows up in the dashboard within seconds, and the reverse. Set `VITE_PORTAL_URL` if the portal is hosted somewhere else; the invite messages use that address.

## API contracts

- **Part 1:** the original contract (disasters, families, shelters, plans, updates, reports, auth).
- **Part 2:** [`docs/api-contract-part-2.md`](docs/api-contract-part-2.md). It adds resource types, organizations, inventory, needs, shipments, targeted broadcasts, conversations, the activity feed, **partner accounts and permissions** (§10), and **citizen assistance** with its privacy rules (§11). It extends Part 1 without changing it.

`src/api/live.js` calls exactly the endpoints in both parts.

## Layout

```
src/
  api/live.js          fetch client for the real API (Part 1 + Part 2)
  api/mock.js          mock implementation of both contracts (used in the browser and by mock-server/)
  api/index.js         picks one based on VITE_USE_MOCK
  auth.jsx             operator-only session
  data.jsx             DataProvider: loads and polls every collection for the selected disaster
  lib/logistics.js     need progress, source matching, coverage, needs-attention rules
  lib/constants.js     enums, broadcast templates
  components/          Layout (sidebar/topbar), map, dialogs (shipment, need, org), shared UI
  pages/               one file per page above
mock-server/
  handler.js           shared mock API over HTTP (auth, sessions, partner scoping, JSON-file persistence)
  standalone.js        `npm run mock-api` on :8787
docs/
  api-contract-part-2.md
```
