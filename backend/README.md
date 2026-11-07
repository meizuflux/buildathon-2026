# Haven API

Litestar REST API backed by async APSW/SQLite, managed with [uv](https://docs.astral.sh/uv/).

```sh
cd backend
uv sync
just dev
```

Run the development checks with `just check`. The individual recipes are `just lint`,
`just format-check`, `just typecheck`, and `just test`; use `just format` to apply Ruff formatting.

The API listens on `http://127.0.0.1:8000`. Check `GET /health` or visit `/schema` for Swagger UI or `/schema/openapi.json` for the generated OpenAPI document. The Swagger UI loads its assets from a CDN and needs internet access. Run tests with `just test`.

Use `just prod` to run without reload (configure `HOST`, `PORT`, and `WEB_CONCURRENCY` through environment variables). Run `just schema` to create missing tables without starting the server. Run `just` to list all recipes.

Database operations use APSW’s async interface. Password hashing runs off the event loop.

On startup, the application creates the tables in `src/haven/schema.sql`. The default database is `disaster_response.sqlite3` in the current working directory; set `DATABASE_PATH` to change it. This is an initial schema, not a migration system: changes to existing tables require recreating the development database or applying changes manually.

## Authentication

All application routes use the `/api` prefix. Register a family account with `POST /api/auth/register` using `{"email":"family@example.com","password":"..."}` (at least 8 characters). Public registration never accepts a role. Sign in with the same JSON at `POST /api/auth/login`; send the returned opaque token as `Authorization: Bearer <token>` to `GET /api/me` and `POST /api/auth/logout`. Sessions expire after 24 hours and logout revokes the current session. A newly registered user has `family_id: null` until a family profile is created.

To create an operator, run `just create-operator` locally and enter credentials interactively. Login attempts are limited to five per account and 50 per direct client IP in a 15-minute window; successful login clears the account counter, while the IP counter remains. The production recipe disables forwarded headers; behind a proxy, configure trusted proxy handling before relying on client-IP limits. Passwords use Argon2id with random salts, and only hashes of session tokens are stored.

Family profiles, plans, and report submissions require the owning family's bearer token or an operator token. Shelter edits, official update publishing, and disaster report listings require an operator token. Disaster, shelter, and official update listings are public.

Existing accounts created with the earlier scrypt implementation cannot sign in; recreate those development accounts.

## Demo data

Run `just demo-data` to create seven donation hubs around Jakarta (`DEMO_CENTER` in `demo_data.py`), a family account (`family@demo.example`), a government operator (`government@demo.example`), one hub staff account per hub (for example `staff.istiqlal@demo.example`), and a few sample requests and pledges. The script generates a separate password for each account and prints it once when the account is created; set `DEMO_PASSWORD` to give every new account that password instead. Re-running the script leaves existing accounts, passwords, and rows unchanged. These accounts are intended for demo databases.

The script also creates a fictional active Tampa hurricane, 20 fictional shelters and 1,000 synthetic family profiles with allocated plans, plus an official demo update. Synthetic family accounts cannot sign in; use the demo family account to exercise registration/profile creation independently. Locations and addresses are fictional and must not be used for emergency response. The scenario is inserted only when its disaster ID is absent, so reruns preserve edits. Use a separate `DATABASE_PATH` for a fresh demo. Disaster creation is otherwise outside the REST contract.

## Disaster response API

All paths below start with `/api`. Handlers are grouped in `haven/routers`, with shared authorization in `api_common.py` and native async APSW connections in `db.py`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/disasters` | List active disasters. |
| GET | `/families?disaster_id=...` | List family profiles for a disaster (operator only; paginated). |
| GET | `/disasters/{disaster_id}/plans` | List latest family plans for a disaster (operator only; paginated). |
| POST | `/families` | Create the signed-in family's profile (one per account). |
| GET, PATCH | `/families/{family_id}` | Read or merge changes into a family profile. |
| GET | `/shelters?disaster_id=...` | List shelters for a disaster. |
| POST | `/shelters` | Create a shelter as an operator. |
| PATCH | `/shelters/{shelter_id}` | Merge shelter changes as an operator. |
| POST | `/families/{family_id}/plan/generate` | Reallocate the affected disaster and retrieve this family's plan; unchanged plans retain their version. |
| GET | `/families/{family_id}/plan` | Retrieve the latest persisted plan, generated automatically when the profile is created. |
| GET, POST | `/disasters/{disaster_id}/updates` | Read official updates or publish one as an operator. |
| POST | `/families/{family_id}/reports` | Submit an idempotent family report. |
| GET | `/disasters/{disaster_id}/reports` | List family reports as an operator. |

Family and plan listings accept `limit` (1–1000, default 100) and `offset` (default 0), and return `total`, `limit`, and `offset`. Shelter listings already include resource availability, capabilities, and capacity.

PATCH requests merge supplied nested fields, preserving omitted fields. Nullable notes may be cleared with `null`. Coordinates, counts, capacities, and enumerated values are validated. Errors use `{"error":{"code":"...","message":"..."}}` consistently.

## Coordinated allocation and plan changes

Family creation and relevant profile or shelter edits recompute assignments for the affected disaster in the same database transaction as the edit. Moving a family or shelter to another disaster recomputes both pools. Assignments reserve shelter spaces for the whole household. Reassignment releases the former reservation atomically; repeating a request does not reserve more places. Existing reservations at open or full shelters are preserved across recomputes, including mismatch overrides reported through plan alerts.

`capacity.available_people` is the unreserved capacity, floored at zero when assignments exceed the operator's allocation budget or the shelter's listed total. An internal budget preserves operator capacity accounting while allocations change the free count. Capacity never blocks a destination: if all compatible shelters are full, households are assigned to the shelter that adds the least physical overflow. Existing assignments are retained when capacity is reduced. Closed shelters are excluded from new placements; shelters marked `full` are used only when an overflow placement is needed. Over-capacity plans contain a `shelter_capacity_overflow` alert with the assigned count, listed total, and overflow amounts.

The allocator uses the existing profile fields and shelter capability/resource labels. Car ownership influences distance preference: families without a car receive stronger preference for nearby shelters, while families with cars can be placed farther away. Geographic distance is an allocation preference, not a verified route or a transportation booking. Free-text needs continue to use the existing broad capability flags; the backend does not verify a particular medication or interpret clinical notes.

Allocation is deterministic: immediate-medication needs are considered first, followed by families with fewer compatible destinations, families without a car, larger households, and stable creation-time/ID ordering. A bounded search refines small pools with this objective: maximize households placed, then people served, then minimize total travel distance. Capacity-aware placements run first. Remaining households are assigned to a compatible open or full shelter even if this exceeds its budget or listed total. If no compatible shelter exists, the least-mismatched open or full shelter is assigned and the plan includes a critical `shelter_needs_mismatch` alert. If every shelter is closed, the plan remains unmatched with a critical `no_open_shelter` alert. The search is bounded, so large pools retain heuristic limitations.

Food, water, medication, and clothes remain availability labels. Immediate-medication matching requires an available or limited medication label alongside medical staff. Other labels are included in the selected shelter's plan snapshot; labels do not represent quantities or reserved inventory.

Plans are persisted snapshots, including the selected shelter's capabilities and resources. The `alerts` array is returned by family plan endpoints and the operator disaster plan listing so clients can display capacity overflow, unmet needs, or the absence of an open shelter. Relevant family or selected-shelter changes automatically publish a new version even when the destination stays the same; unchanged results keep their existing version and timestamp. Derived free-space changes alone do not churn a family's plan. The explicit generation endpoint uses the same coordinated allocator. Startup reconciles existing profiles and legacy recommendations with the allocation ledger. Internal input fingerprints are stored for version comparison and omitted from API responses.

Plan retrieval supports `?after_version=1&wait_seconds=25` (0–25 seconds). It returns a newer plan with 200 or an empty 204 when unchanged at timeout, rechecking authorization during the wait. Family report retries reuse `client_request_id`; an identical retry returns the stored report, while a changed payload with the same key returns 409.

Clients can read the initial plan after profile creation, then repeat long polls using the last received version. Replace the cached plan on a newer 200 response; retain it and poll again after 204. Updates use this existing long-polling contract rather than a separate push channel.

## Operational alerts feed

Operators can poll `GET /api/disasters/{disaster_id}/alerts?limit=100&offset=0`
with `Authorization: Bearer <token>`. The response is
`{"alerts": [...], "total": 0, "limit": 100, "offset": 0}`.
Each alert includes a stable `id`, `disaster_id`, `code`, `severity`, `message`,
nullable `shelter_id` and `family_id`, `updated_at`, and structured `details`.
Render `message` and `severity`; use `id` as the frontend list key.

The feed shows current conditions: shelter physical/allocation overflow or full
capacity, limited/unavailable supplies, and latest-plan warnings for unmet family
needs or no available shelter. Capacity warnings are deduplicated per shelter.
Critical alerts sort before warnings, then by newest update with stable ID ties.
Resolved conditions disappear when the frontend fetches again; this is not an
historical event log. Replace the displayed list on refresh. Offset pagination
can shift as conditions change. Limits range from 1 to 1000. The endpoint is
operator-only because family alerts expose operational household information.

## Donation distribution

Community hubs (churches, fire stations, schools) hold donated supplies. Citizens find hubs, pledge drop-offs, and request goods. Hub staff confirm drop-offs and log stock. Government operators claim citizen requests, choose a source hub and whether to deliver or have the citizen pick up, and dispatch transport to clear full hubs.

Roles: `family` (citizen), `hub_staff` (linked to one hub through the `hub_staff` table), and `operator`. The `users.role` check now includes `hub_staff`, so recreate development databases created before this change.

Supply categories are `water`, `diapers`, `formula`, `canned_goods`, and `blankets`. Each hub supply in a response has `quantity` (on hand), `target`, `pledged` (pending drop-offs), `reserved` (promised to assigned requests), `available = quantity - reserved`, and `need = max(target - quantity - pledged, 0)`. Staff set the capacity percentage by hand in check-ins. Hub responses also include `open_pickup` (the dispatched transport, or `null`).

### Hubs and transport

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/hubs/nearby?lat=&lng=&radius_km=25&limit=20&needs=&has=` | public | Hubs within the radius, nearest first, with `distance_km`. `needs=<category>` keeps hubs short on that category; `has=<category>` keeps hubs with some available |
| `GET /api/hubs?min_capacity=0` | public | Hubs at or above a capacity percentage, fullest first |
| `GET /api/hubs/{hub_id}` | public | One hub |
| `PUT /api/hubs/{hub_id}/inventory` | that hub's staff, operator | `{"capacity_pct": 0-100, "supplies": [{"category","quantity","target"}]}` |
| `POST /api/hubs/{hub_id}/pickups` | operator | Dispatches transport; 409 `pickup_already_open` if one is already dispatched |
| `GET /api/pickups?status=` | operator | Pickups, newest first, with `hub_name` |
| `PATCH /api/pickups/{pickup_id}` | operator | `{"status": "completed" or "cancelled", "capacity_pct": 25}`; capacity applies only when completed |

### Citizen requests

`open` → claim → `assigned` → fulfill → `fulfilled`. The assignee can release a request back to `open`; the citizen can cancel while it is `open` or `assigned`.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/requests` | family | `{"items": [{"category","quantity"}], "latitude", "longitude", "address", "notes"}`. 409 `request_limit` when the citizen is at their cap |
| `GET /api/requests/limits` | family | `{"active", "base_cap", "categories": {category: {"cap", "level", "pressure"}}}` |
| `GET /api/requests/mine` | family | The citizen's requests, with source `hub` and `method` once assigned |
| `POST /api/requests/{id}/cancel` | family (owner) | 409 `request_closed` once fulfilled or cancelled |
| `GET /api/requests?status=&assigned_to_me=true` | operator | Oldest first. Open requests include `suggested_hubs`: up to three ranked hubs with `score` and `reasons`; the first is recommended |
| `POST /api/requests/{id}/claim` | operator | `{"hub_id", "method": "delivery" or "pickup"}`. 409 `insufficient_stock` if the hub can't cover it after other reservations |
| `POST /api/requests/{id}/release` | assignee | Returns the request to the open queue |
| `POST /api/requests/{id}/fulfill` | assignee | Removes the items from the source hub's inventory |

**Recommended source hubs** (`donations/planner.py`): each hub that can cover a request is scored in kilometre-equivalents as distance, plus 15 times the share of the drawn units that would push the hub below its target (pending pledges count as stock), minus 5 for hubs at 90% capacity or more (2 at 70% or more), since sending goods out frees space. All open requests are planned together with a regret heuristic, so suggestions never promise the same units twice and a request with few options is placed before one with many.

**Fair-share cap** (`donations/fairness.py`): a citizen may hold 3 active (open or assigned) requests. For each category, pressure is open demand divided by available stock; below 0.25 the cap rises to 4, from 0.6 it drops to 2, and from 1.0 to 1. A request is limited by its scarcest category.

### Drop-off pledges

`pending` → `received` (items added to inventory) or `no_show`; the citizen can cancel while pending.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/hubs/{hub_id}/pledges` | family | `{"items": [...], "notes"}`. 409 `hub_full` at 90% capacity or more |
| `GET /api/pledges/mine` | family | The citizen's pledges |
| `POST /api/pledges/{id}/cancel` | family (owner) | Pending pledges only |
| `GET /api/hubs/{hub_id}/pledges?status=pending` | that hub's staff, operator | Oldest first, with `donor_email` |
| `POST /api/pledges/{id}/receive` | that hub's staff, operator | Adds the items to inventory |
| `POST /api/pledges/{id}/no-show` | that hub's staff, operator | Closes the pledge without changing inventory |

CORS allows all origins by default; set `CORS_ORIGINS` to a comma-separated list to restrict it. UI components live in `app/src/donations/` (React Native) and `frontend/src/donations/` (React + Tailwind); `donations-sandbox/` runs them against this API.
