# Haven API

Litestar REST API backed by async APSW/SQLite, managed with [uv](https://docs.astral.sh/uv/).

```sh
cd backend
uv sync
just dev
```

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

Run `just demo-data` to create a family account (`family@demo.example`) and a government operator (`government@demo.example`) in the configured database. The script generates a separate password for each account and prints it once when the account is created. Save those passwords for the demo. Re-running the script leaves existing accounts and passwords unchanged. These accounts are intended for demo databases.

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
