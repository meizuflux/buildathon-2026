# Haven Operations dashboard

React + Vite dashboard for government operators managing disaster response.
The backend's running OpenAPI schema at `http://127.0.0.1:8000/schema` is the
API contract. The dashboard covers family operations, shelter management,
allocation plans, operational alerts, official updates, and reports.

The Logistics section contains preview-only WIP screens for Needs, Dispatch,
and Inventory. Shelter names, reserved capacity, resource availability, and update
times use the shelters already loaded from the API. Example requests and delivery
stages are generated from that shelter data; controls are disabled and no logistics
API calls or changes are saved. Stock quantities are shown as not tracked because
shelters only report availability labels. Organizations and the partner portal are removed.

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

Run `npm run build` to check and build the dashboard.
