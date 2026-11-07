# Haven Partner Portal

A web portal for **shelters and relief organizations** (third-party aid) working with the government operations center. It shares one API with the government dashboard, so every update a partner makes shows up for operators within seconds, and the reverse.

There is no public sign-up. Operators create logins from the dashboard (Organizations → an organization → *Partner portal access*, or the *Portal access* page). A new login comes with a temporary password, and the partner must choose their own password the first time they sign in.

## What partners can do

| Page | Organizations | Shelters |
|---|---|---|
| **Overview** | Set status (active / limited / inactive); stock summary; actions waiting on them; their requests; latest official updates | Set status (open / full / closed); **one-tap ±1 / ±5 for spaces free**; supply levels; actions waiting on them; their requests; updates |
| **Inventory** / **Status & capacity** | Edit stock counts, add items, see what's reserved for approved shipments | Capacity, supply levels (food, water, medication, clothes), pets / children / wheelchair, medical staff, special-care notes |
| **Shipments** | Incoming and outgoing. **Mark departed** when a shipment leaves; withdraw a pending offer | Incoming. **Confirm delivery**, which closes out the linked request automatically |
| **Requests** | Ask operations for specific supplies (quantity, urgency, deadline); track received / on the way / still needed; cancel | Same |
| **Citizens** (approved organizations) | A map and list of households nearby who can't reach an aid location: request type, items, urgency and household summary (people, children, medication, accessibility, pets, no car). Locations are approximate and identities hidden until you **Accept**. Then you get name, phone, address, exact location, directions, the household's message and care notes. Send them an ETA and a message, mark **On our way** and **Completed** (optionally deducting delivered items from stock), or **Release** if you can't follow through | — |
| **Help nearby** | Open needs at other sites, ranked by what you stock, urgency and distance. **Offer** stock, which goes to operations for approval | — |
| **Messages** | Direct threads with the operations center | Same |
| **Official updates** | Broadcasts operations has sent for the disaster | Same |
| **Profile / Account** | Contact details, services, coverage, notes; change password | Change password |

The layout is built for phones and tablets as well as desktops.

## Citizen assistance and privacy

Organizations only see citizen requests if operations has approved them for citizen assistance, and only requests from households that **consented** to share with aid organizations, within the organization's coverage radius. Before accepting, the portal shows a rounded location (about 1 km) and household flags only. Accepting releases the contact details and care notes to that organization and is logged for operations. Releasing a request removes that access again. The backend enforces these rules (Part 2 §11), so the UI isn't the only safeguard. Demo households, names, phone numbers and addresses are synthetic.

## Run

You need the government dashboard's dev server running (frontend branch). It hosts the shared mock API:

```sh
# terminal 1 — frontend branch
cd frontend && npm install && npm run dev      # http://localhost:5173

# terminal 2 — 3rdparty branch
cd 3rdparty && npm install && npm run dev      # http://localhost:5174
```

The portal proxies `/api` to the dashboard's dev server (`http://localhost:5173`). To point it elsewhere, set `HAVEN_API_URL`:
- `HAVEN_API_URL=http://127.0.0.1:8000`: the real backend, once it implements Part 2 §10
- `HAVEN_API_URL=http://127.0.0.1:8787`: the standalone mock (`npm run mock-api` in `frontend/`)

**Demo logins** (shared mock only; fictional; password `haven-demo`):
- `bayside@demo.example`: Bayside Food Bank (organization)
- `stluke@demo.example`: St. Luke Medical Annex (shelter)

## API

This portal uses the Part 1 contract and the Part 2 add-on. **§10 defines the `partner` role**: the login fields, change-password, operator-managed accounts, and exactly what partners may read and change. The add-on lives on the frontend branch at `frontend/docs/api-contract-part-2.md`. Requests go through `src/api.js`.

Shipments that partners create are **offers** (`status: "requested"`). Operators approve them on the dashboard's Dispatch board, which reserves the stock. After that, the partner marks the shipment departed and the receiving site confirms delivery.

## Layout

```
src/
  api.js            HTTP client (partner-scoped endpoints)
  auth.jsx          session; partner-only; first-login password change
  data.jsx          loads and polls everything this site can see (8 s)
  components/       Layout (header + tabs), ShipmentCard, shared UI
  pages/            Overview, StatusPage (shelters), Inventory (orgs), Shipments,
                    Requests, HelpNearby (orgs), Messages, Updates, Account, Login
  lib/              formatting, constants
```
