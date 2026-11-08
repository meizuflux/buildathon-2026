# Haven Operations dashboard

React + TypeScript + Vite dashboard for government operators managing disaster
response. The backend's OpenAPI schema is the API contract and is used to
generate the dashboard's API types. The dashboard covers family operations,
shelter management, allocation plans, operational alerts, official updates, and
reports.

The Logistics section contains preview-only WIP screens for Needs, Dispatch,
and Inventory. Shelter names, reserved capacity, resource availability, and update
times use the shelters already loaded from the API. Example requests and delivery
stages are generated from that shelter data; controls are disabled and no logistics
API calls or changes are saved. Stock quantities are shown as not tracked because
shelters only report availability labels.

## Run

Start the backend as described in [backend/README.md](../backend/README.md),
then run:

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with an operator account. The dev server
proxies `/api` to `http://127.0.0.1:8000` by default. Set `HAVEN_API_URL` before
starting Vite to use a different backend. For a production deployment, route
`/api` to the backend on the same origin.

Run `npm run typecheck` to type-check, or `npm run build` to type-check and
build the dashboard.

## API types

The Litestar CLI generates TypeScript definitions from the backend's OpenAPI
schema. Regenerate them after changing an API response or request shape:

```sh
cd backend
just schema-typescript
```

This writes `frontend/src/api/api-specs.ts`. Friendly aliases and dashboard-only
additions live in `frontend/src/api/types.ts`.
