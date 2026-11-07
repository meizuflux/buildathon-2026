# Haven API

Litestar and APSW/SQLite backend scaffold, managed with [uv](https://docs.astral.sh/uv/).

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

Family ownership checks and most disaster-response endpoints are not yet implemented. Use HTTPS and secure device storage when deploying; this is still a hackathon scaffold, not a production-ready authentication service.

Existing accounts created with the earlier scrypt implementation cannot sign in; recreate those development accounts.

## Demo data

Run `just demo-data` to create seven donation hubs around a placeholder demo center (Houston, TX; `DEMO_CENTER` in `demo_data.py`), a family account (`family@demo.example`), a government operator (`government@demo.example`), one hub staff account per hub (for example `staff.station-8@demo.example`), and a few sample requests and pledges. The script generates a separate password for each account and prints it once when the account is created; set `DEMO_PASSWORD` to give every new account that password instead. Re-running the script leaves existing accounts, passwords, and rows unchanged. These accounts are intended for demo databases.

Region-specific resources will be added once a region is selected and their API routes exist.

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
| `POST /api/requests` | family | `{"items": [{"category","quantity"}], "latitude", "longitude", "address", "notes"}` |
| `GET /api/requests/mine` | family | The citizen's requests, with source `hub` and `method` once assigned |
| `POST /api/requests/{id}/cancel` | family (owner) | 409 `request_closed` once fulfilled or cancelled |
| `GET /api/requests?status=&assigned_to_me=true` | operator | Oldest first. Open requests include `suggested_hubs`: the three nearest hubs with enough available stock |
| `POST /api/requests/{id}/claim` | operator | `{"hub_id", "method": "delivery" or "pickup"}`. 409 `insufficient_stock` if the hub can't cover it after other reservations |
| `POST /api/requests/{id}/release` | assignee | Returns the request to the open queue |
| `POST /api/requests/{id}/fulfill` | assignee | Removes the items from the source hub's inventory |

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
