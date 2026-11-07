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

The demo script creates accounts only. Load disaster records into the database before creating family profiles or shelters; disaster creation is outside the REST contract.

## Disaster response API

All paths below start with `/api`. Handlers are grouped in `haven/routers`, with shared authorization in `api_common.py` and native async APSW connections in `db.py`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/disasters` | List active disasters. |
| POST | `/families` | Create the signed-in family's profile (one per account). |
| GET, PATCH | `/families/{family_id}` | Read or merge changes into a family profile. |
| GET | `/shelters?disaster_id=...` | List shelters for a disaster. |
| POST | `/shelters` | Create a shelter as an operator. |
| PATCH | `/shelters/{shelter_id}` | Merge shelter changes as an operator. |
| POST | `/families/{family_id}/plan/generate` | Generate and persist a new recommendation version. |
| GET | `/families/{family_id}/plan` | Retrieve the latest persisted plan; 404 `plan_not_found` before generation. |
| GET, POST | `/disasters/{disaster_id}/updates` | Read official updates or publish one as an operator. |
| POST | `/families/{family_id}/reports` | Submit an idempotent family report. |
| GET | `/disasters/{disaster_id}/reports` | List family reports as an operator. |

PATCH requests merge supplied nested fields, preserving omitted fields. Nullable notes may be cleared with `null`. Coordinates, counts, capacities, and enumerated values are validated. Errors use `{"error":{"code":"...","message":"..."}}` consistently.

Recommendations never reserve capacity. They select an eligible open shelter in the same disaster with enough available places and compatible capabilities, then rank eligible shelters by distance. Matching uses capability flags: accessibility notes require wheelchair access, medical needs require staff, immediate medication additionally requires available or limited medication, and special care notes require a shelter with special care notes. Free-text care requirements are not interpreted. Each generation persists a new version, including an explicit `no_match` result when appropriate. Existing plans remain snapshots; regenerate after profile or shelter changes.

Plan retrieval supports `?after_version=1&wait_seconds=25` (0–25 seconds). It returns a newer plan with 200 or an empty 204 when unchanged at timeout, rechecking authorization during the wait. Family report retries reuse `client_request_id`; an identical retry returns the stored report, while a changed payload with the same key returns 409.
