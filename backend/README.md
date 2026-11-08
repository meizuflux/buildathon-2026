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

On startup, the application creates the base tables in `src/haven/schema.sql`, applies versioned database migrations, and reconciles existing plans with the allocation ledger before serving requests. The default database is `disaster_response.sqlite3` in the current working directory; set `DATABASE_PATH` to change it. Run `just schema` to perform the same database setup without starting the server.

## Authentication

All application routes use the `/api` prefix. Register a family account with `POST /api/auth/register` using `{"email":"family@example.com","password":"..."}` (at least 8 characters). Public registration never accepts a role. Sign in with the same JSON at `POST /api/auth/login`; send the returned opaque token as `Authorization: Bearer <token>` to `GET /api/me` and `POST /api/auth/logout`. Sessions expire after 24 hours and logout revokes the current session. A newly registered user has `family_id: null` until a family profile is created.

To create an operator, run `just create-operator` locally and enter credentials interactively. Login attempts are limited to five per account and 50 per direct client IP in a 15-minute window; successful login clears the account counter, while the IP counter remains. The production recipe disables forwarded headers; behind a proxy, configure trusted proxy handling before relying on client-IP limits. Passwords use Argon2id with random salts, and only hashes of session tokens are stored.

Family profiles, plans, and report submissions require the owning family's bearer token or an operator token. Shelter edits, official update publishing, and disaster report listings require an operator token. Disaster, shelter, and official update listings are public.

Existing accounts created with the earlier scrypt implementation cannot sign in; recreate those development accounts.

## Demo data

With the API stopped, run `just demo-data` to delete and recreate the configured SQLite database (`DATABASE_PATH`, default `disaster_response.sqlite3`). Every run starts fresh, discarding all existing records, edits, accounts, and sessions. The command creates a family account (`family@demo.example`) and a government operator (`government@demo.example`) and prints fresh generated passwords. Restart the API and sign in with those credentials.

The script creates a fictional active hurricane in **Golden Gate Estates, Naples**, 1,000 synthetic households at distinct real houses, seven simulated shelters at local school sites, allocated plans, and an official demo update. Synthetic family accounts cannot sign in; use the demo family account to exercise registration/profile creation independently. The household characteristics, shelter operations, capacities, capabilities, and supplies are fictional; these records do not describe actual residents or current shelter availability.

Household profiles use a repeatable random sample (seed 42), shuffled across the house locations. Sizes range from one to eight people, including single adults, single parents, couples, families with children, and larger households. Car access, pets, medication urgency, accessibility needs, and other care needs vary across profiles, with specific notes about dogs/cats, prescription refills, walkers/wheelchairs, infant supplies, allergies, and power-dependent equipment. Guaranteed examples include a four-person household with a car and dog, and a single adult without a car who needs mobility and medication assistance. The distribution is designed for demo coverage rather than population estimates; seeding generates current plans for every household.

House locations come from Collier County's current single-family address points on Estates roads. Every selected point was checked to intersect a distinct 2025 building footprint. Shelters use county address coordinates for Palmetto Ridge High, Corkscrew Middle, Cypress Palm Middle, Sabal Palm Elementary, Big Cypress Elementary, Estates Elementary, and Corkscrew Elementary. The fixture and its source links are in [`src/haven/data/golden_gate_estates.json`](src/haven/data/golden_gate_estates.json). Seeding works offline. To deliberately refresh the source snapshot, run `python scripts/refresh_demo_locations.py` with network access; review the resulting fixture before committing it.

Demo data is disposable: there are no data migrations, version markers, or compatibility IDs. Change the seed or fixture and rerun `just demo-data` to rebuild the scenario and its allocations. The simulated shelter capacity totals 4,000. Disaster creation is otherwise outside the REST contract.

## Disaster response API

All paths below start with `/api`. Handlers are grouped in `haven/routers`, with shared authorization in `api_common.py` and native async APSW connections in `db.py`.

CORS allows all origins by default; set `CORS_ORIGINS` to a comma-separated list to restrict it.

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
| POST | `/disasters/{disaster_id}/updates/preview` | Count family profiles currently matching an update target (operator only). |
| POST | `/families/{family_id}/reports` | Submit an idempotent family report. |
| GET | `/disasters/{disaster_id}/reports` | List family reports as an operator. |
| GET | `/disasters/{disaster_id}/activity` | Operator timeline of recorded actions, newest first; optional `limit` (1–1000, default 50). |

Family and plan listings accept `limit` (1–1000, default 100) and `offset` (default 0), and return `total`, `limit`, and `offset`. Shelter listings include resource availability labels, capabilities, and capacity; these describe shelter readiness and are not an inventory tracker or resource request system.

PATCH requests merge supplied nested fields, preserving omitted fields. Nullable notes may be cleared with `null`. Coordinates, counts, capacities, and enumerated values are validated. Errors use `{"error":{"code":"...","message":"..."}}` consistently.

Official updates can target the families currently assigned to a shelter by adding
`"target": {"type": "shelter", "shelter_id": "shelter_..."}` when publishing.
Omit the target or use `{"type": "all"}` for a general update. Operators see all
updates; anonymous visitors see general updates; authenticated families also see
updates for their current assignment. Reassignment changes which targeted updates
are visible. The shelter must belong to the same disaster.

To preview the current number of matching family profiles, post
`{"target": {"type": "all"}}` or a shelter target to the updates preview
endpoint. It returns `{"recipient_count": 0}`; the count is a snapshot of
current assignments, not a delivery or read count.

## Coordinated allocation and plan changes

Family creation and relevant profile or shelter edits recompute assignments for the affected disaster in the same database transaction as the edit. Moving a family or shelter to another disaster recomputes both pools. Assignments reserve shelter spaces for the whole household. Reassignment releases the former reservation atomically; repeating a request does not reserve more places. Existing assignments can change when a better overall allocation becomes available, including when a new shelter opens. Avoiding moves is a final tie-breaker, rather than a reservation lock.

The allocator uses **Google OR-Tools CP-SAT** to consider every household in a disaster together. Every household receives exactly one open or full shelter whenever such a shelter exists; households are never split. Closed shelters are excluded. The policy uses strict priority tiers, so improving a lower tier cannot worsen a higher one:

1. Minimize unmet medical, medication, accessibility, and special-care requirements for each household.
2. Minimize other unmet requirements (pets and child-friendly facilities).
3. Minimize people over listed physical capacity, then people over operator allocation budgets. A full shelter has zero usable budget. Where overflow is unavoidable, minimize the largest overflow as a proportion of shelter size.
4. Prefer better food, water, and clothes availability labels, plus medication availability for immediate-medication needs. Label penalties are weighted by household size: available (0), limited (1), unknown (2), unavailable (3).
5. Minimize total household travel distance for households without cars.
6. Minimize total household travel distance for everyone.
7. Minimize changes to existing destinations.

Needs are evaluated first for each household. Because capacity may overflow, every household can simultaneously receive its best needs match. Worse matches are excluded before optimization, guaranteeing that capacity, supplies, distance, or a search timeout cannot trade away supported needs. The remaining objectives are solved one at a time, fixing each proven optimum before proceeding. A complete deterministic seed and the prior assignments are compared under the same objective; the solver cannot replace them with a worse result. Search has a shared two-second budget per disaster pool (excluding input preparation and persistence). An unproved stage stops further optimization, preserving the best complete placement found; large pools may therefore return a feasible result rather than a proven optimum. Stable input ordering and a single solver worker make ordering repeatable; timing limits may still affect the degree of improvement. Optimization runs off the API event loop.

`capacity.available_people` is the unreserved operator allocation budget, floored at zero and capped at listed physical capacity. An internal budget preserves operator capacity accounting while allocations change the free count. Capacity is a warning threshold, so a household whose only supported destination is full still receives that destination. Plans carry `shelter_capacity_overflow` alerts for physical/budget overflow or a full shelter. If no shelter meets every requirement, the best clinical/other-needs match is assigned with a critical `shelter_needs_mismatch` alert listing the unmet requirements. If no open or full shelter exists, the plan has no destination and a critical `no_open_shelter` alert; the allocator cannot invent a real destination.

Geographic distance is great-circle distance rounded to meters, not a verified route or a transportation booking. Car ownership creates a strict preference for shorter travel for households without cars, rather than a hard travel-radius cutoff. Free-text needs use the existing broad capability flags; the backend does not verify a particular medication or interpret clinical notes. Food, water, medication, and clothes remain availability labels, not quantities or reserved inventory. Immediate-medication matching requires an available or limited medication label alongside medical staff.

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
