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

Run `just demo-data` to create seven donation hubs around a placeholder demo center (Houston, TX; `DEMO_CENTER` in `demo_data.py`), plus a family account (`family@demo.example`) and a government operator (`government@demo.example`) in the configured database. The script generates a separate password for each account and prints it once when the account is created. Save those passwords for the demo. Re-running the script leaves existing accounts and passwords unchanged. These accounts are intended for demo databases.

Region-specific resources will be added once a region is selected and their API routes exist.

## Donation hubs

Community hubs (churches, fire stations, schools) report storage capacity and supply levels. Citizens find nearby hubs, and operators dispatch transport to clear full ones. Supply categories are `water`, `diapers`, `formula`, `canned_goods`, and `blankets`. Each supply has a `quantity` and a `target`, and responses include `need = max(target - quantity, 0)`.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/hubs/nearby?lat=&lng=&radius_km=25&limit=20` | public | Hubs within the radius, nearest first, with `distance_km` |
| `GET /api/hubs?min_capacity=0` | public | Hubs at or above a capacity percentage, fullest first |
| `PUT /api/hubs/{hub_id}/inventory` | operator | `{"capacity_pct": 0-100, "supplies": [{"category","quantity","target"}]}` sets capacity and upserts the listed supplies |
| `POST /api/hubs/{hub_id}/pickups` | operator | `{"notes": "..."}` (optional). Dispatches a transport pickup; returns 409 `pickup_already_open` if one is already dispatched |

Hub responses include `open_pickup` (the dispatched pickup, or `null`). CORS allows all origins by default; set `CORS_ORIGINS` to a comma-separated list to restrict it. Drop-in UI components live in `app/src/donations/` (React Native) and `frontend/src/donations/` (React + Tailwind).
