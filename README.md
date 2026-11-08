<p align="center">
  <img src="frontend/public/haven-mark.svg" alt="Haven logo" width="200" height="200" />
</p>

<h1 align="center">Haven</h1>

<p align="center">Disaster response coordination for government operations teams.</p>

Haven is a disaster response coordination project. It brings together a government operations dashboard and an API for managing family profiles, shelters, allocation plans, alerts, official updates, and reports.

## Project structure

- [`app/`](app/) — React Native/Expo household app.
- [`backend/`](backend/) — Litestar API with an SQLite database, authentication, family profiles, shelters, alerts, reports, and shelter allocation.
- [`frontend/`](frontend/) — React/Vite operations dashboard, including preview-only logistics screens.

## Getting started

Prerequisites: Python 3.12 or newer, [uv](https://docs.astral.sh/uv/), [just](https://github.com/casey/just), and Node.js with npm.

Start the API from one terminal:

```sh
cd backend
uv sync
just dev
```

The API runs at http://127.0.0.1:8000. Visit http://127.0.0.1:8000/health to check the database connection or http://127.0.0.1:8000/schema for the API documentation. The Swagger UI requires internet access to load its assets.

Create an operator in another terminal, or load the demo data described below:

```sh
cd backend
just create-operator
```

Start the operations dashboard in a separate terminal:

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with the operator account. Vite forwards `/api` requests to the local API by default. Set `HAVEN_API_URL` before starting Vite to change the target.

## Demo data

With the API stopped, recreate the disposable demo database and accounts:

```sh
cd backend
just demo-data
```

Every run deletes and rebuilds the configured SQLite database and prints the demo credentials: `family@example.com` / `family` and `gov@example.com` / `gov`. Restart the API and sign in with those credentials. The scenario places 1,000 synthetic households at actual houses in Golden Gate Estates, Naples, and seven simulated shelters at local school sites. Household profiles and shelter operations are fictional and must not be used for real emergency response. See the [backend README](backend/README.md#demo-data) for details.

## Development and checks

The backend initializes its schema and applies migrations on startup. Its default database is `disaster_response.sqlite3` in the working directory; set `DATABASE_PATH` to use another file. To initialize it without starting the server, run `just schema` from `backend/`.

```sh
# Backend lint, formatting, type checks, and tests
cd backend
just check

# Dashboard production build
cd ../frontend
npm run build
```

See the [backend README](backend/README.md) for API, authentication, and allocation details, and the [dashboard README](frontend/README.md) for frontend information.
