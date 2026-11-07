# Donations: what changed

This document covers the `donations` branch: what it adds to Haven and how it was reconciled with the logistics work already on `master`.

## In short

Citizens donate or ask for supplies, and the system matches them to the best community hub. Citizens never pick a hub themselves. Hub staff confirm drop-offs and log walk-ins, and government workers deliver matched requests and review unusual (custom) items. Hub stock, "% full", and per-item targets all update themselves.

Everything is built on the logistics tables and endpoints your teammates added in `haven/routers/logistics.py`. That module is unchanged apart from sharing its stock with donations.

## What's new

### Citizen app (`app/src/donations/`, React Native)

Four tabs:

| Tab | What happens |
|---|---|
| **Donate** | Pick items. The server chooses the drop-off hub: nearby, needs those items, and not nearly full. The citizen sees the hub, why it was chosen, and a directions link. |
| **Request** | Pick items. The request is matched to the best hub straight away and the items are set aside, then a worker delivers or arranges pickup. If no hub has the items, the request waits and is matched automatically when stock arrives. |
| **Custom** | For things outside the standard list (e.g. a wheelchair). The citizen describes it and a government worker approves it with a hub and instructions, or declines it. |
| **My activity** | Status of every request, drop-off, and custom item, with cancel buttons. |

Location comes from device GPS (`expo-location` on phones, browser geolocation on web). Each person can have 3 active requests, 4 when supplies are plentiful and down to 1 for scarce items. Items no hub stocks keep the normal 3. Each person can also have one custom item awaiting review.

### Government and hub staff screens (`frontend/src/donations/`, React + Tailwind)

- **Hubs & transport:** a map of hubs colored by % full, and a table of full hubs with **Dispatch Transport Pickup**. **Mark cleared** moves the hub's surplus to the nearest depot.
- **Citizen requests:** each request shows its matched hub and the reasons. The worker picks delivery or pickup and claims it; a separate list shows requests waiting for stock.
- **Custom items:** review queue with the nearest hubs suggested; approve or decline with a message, then mark completed.
- **Hub staff console:** live stock, % full, and targets (all read-only), incoming drop-offs to confirm, and a small form to log walk-in donations.

These are standalone components. They aren't mounted in the dashboard or mobile app yet; `donations-sandbox/` runs them against the API (see below).

### Backend (`backend/src/haven/donations/`)

| Module | Purpose |
|---|---|
| `hubs.py` | Hub listing, walk-ins, hub setup, and transport pickups |
| `supply_requests.py` | Citizen requests: auto-match, claim, release, fulfill, cancel |
| `pledges.py` | Donations matched to a drop-off hub, received or no-show |
| `custom.py` | Custom items and their review |
| `matching.py`, `planner.py` | Choosing the best hub (scoring and joint planning) |
| `targets.py` | Per-item hub targets from local demand |
| `fairness.py` | The demand-adjusted request limit |
| `common.py` | Shared stock operations (reserve, release, consume, add, remove) |

Endpoint details are in `backend/README.md` under **Donation distribution**.

## How the hub choice works

- **Requests:** each hub that can cover a request is scored as distance, plus a penalty for dipping below the hub's target, minus a bonus for hubs that are full (sending goods out frees space). All waiting requests are planned together, so no two are promised the same units.
- **Donations:** the hub that needs the items, is close, and isn't nearly full wins. Hubs at 90% or more, or more than 50 km away, are skipped.
- **Targets:** each item's target is 1.5 × recent demand near the hub, plus a small baseline of essentials. Demand is citizen requests from the last 7 days plus open shelter needs.
- **% full:** units on hand ÷ the hub's storage size, computed live.

## Reconciling with `master`

`master` already had a logistics module (organizations, inventory, needs, shipments) used by the dashboard and the partner portal. This branch had its own version of the same endpoints, so one had to go.

| Decision | Detail |
|---|---|
| **Keep `master`'s logistics module** | This branch's duplicate (`donations/logistics.py`) and its tests were removed. `haven/routers/logistics.py` and its tests are unchanged. |
| **Hubs are organizations plus a `hubs` row** | Organization records stay in `master`'s JSON format. Site type and storage size live in a new `hubs` table, and the `hub_view` view combines them. |
| **One shared stock table** | Donations use `master`'s `inventory` table. Shipments and citizen requests reserve and deduct the same rows; a test checks that neither can double-book the other. |
| **Combined item catalog** | `master`'s 11 resource types are kept. 11 specific citizen items (baby formula, diapers, blankets, cots, generators, fuel, and so on) are added alongside them. `resource_type_details` records which items citizens may use and their display order. |
| **Matching after shipments** | `master`'s shipment code doesn't trigger donation matching, so matching also runs whenever requests are read. The logistics module didn't need changing. |
| **Migration 3** | Upgrades existing databases: creates the donation tables, adds the citizen items, and adds the `hub_staff` role. The role is added by widening the `users` CHECK constraint in place, because the table can't be rebuilt inside the migration transaction without breaking foreign keys (tested in `tests/test_donations_migration.py`). `migrations.py` now also accepts an async function as a migration step. |
| **Demo data** | `master`'s Tampa scenario is kept. Seven hubs, two depots, and four shelter needs are added inside it, plus sample requests and pledges from the scenario's synthetic families. |

### Files changed outside `donations/`

- `schema.sql`: donation section appended (master's tables untouched).
- `migrations.py`: migration 3 and support for function steps.
- `auth.py`, `openapi.py`: `hub_staff` role, and `hub_id` in `/api/me`.
- `app.py`: donations router registered next to `master`'s routers.
- `demo_data.py`: hubs, depots, needs, and staff accounts added to the Tampa scenario.
- `tests/test_migrations.py`: expected schema version updated from 2 to 3.

## Running it

```sh
cd backend
DEMO_PASSWORD=demo-password-2026 just demo-data
just dev

cd donations-sandbox
npm install
npm run dev     # http://localhost:5173
```

The sandbox has three tabs (Citizen app, Hub staff, Government dashboard) and can simulate a phone in Tampa. `donations-sandbox/README.md` has a demo script.

## Verification

- 112 backend tests pass (`just check`: Ruff, ty, pytest), including `master`'s logistics tests and new tests for shared stock and migration 3.
- Browser walkthroughs passed against the merged backend: donate and request matching, custom item review, walk-ins, and pickups moving surplus to a depot.

## Known gaps

- The donation screens aren't mounted in the dashboard (React 19, plain CSS) or the mobile app yet. The dashboard components use Tailwind and would need restyling or a Tailwind setup.
- Donation actions aren't written to `master`'s activity feed.
- Seven Litestar deprecation warnings remain in `haven/routers/logistics.py` (inferred query parameter style). They weren't changed here.
