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
| **Organizations** | `/organizations`, `/organizations/:id` | A directory you can filter by type and service. Each detail page has editable stock counts, open needs, shipment history, status, contact details, a coverage map, and buttons to message, log a need, or dispatch from that organization. |

All data refreshes every 12 seconds. Most items link through to related pages.

## Run

Needs Node 20+.

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Mock vs. live backend

By default the dashboard runs on **mock data** in the browser (`src/api/mock.js`), which implements both API contracts, including their side effects. Organizations and shelters reply to messages automatically a few seconds after you write, so demos feel live. Use the "Mock data ↺" badge in the top bar to reset everything. Any email and password sign in.

To use the real API, create `frontend/.env.local`:

```
VITE_USE_MOCK=false
```

Then start the backend (`cd backend && just dev`, port 8000) and sign in with an **operator** account (`just demo-data` creates `government@demo.example`). The dev server proxies `/api` to `http://127.0.0.1:8000`; set `HAVEN_API_URL` to point it somewhere else.

## API contracts

- **Part 1:** the original contract (disasters, families, shelters, plans, updates, reports, auth).
- **Part 2:** [`docs/api-contract-part-2.md`](docs/api-contract-part-2.md). It adds resource types, organizations, inventory, needs, shipments, targeted broadcasts, conversations and the activity feed. It extends Part 1 without changing it.

`src/api/live.js` calls exactly the endpoints in both parts.

## Layout

```
src/
  api/live.js          fetch client for the real API (Part 1 + Part 2)
  api/mock.js          in-browser mock with the same interface and side effects
  api/index.js         picks one based on VITE_USE_MOCK
  auth.jsx             operator-only session
  data.jsx             DataProvider: loads and polls every collection for the selected disaster
  lib/logistics.js     need progress, source matching, coverage, needs-attention rules
  lib/constants.js     enums, broadcast templates
  components/          Layout (sidebar/topbar), map, dialogs (shipment, need, org), shared UI
  pages/               one file per page above
docs/
  api-contract-part-2.md
```
