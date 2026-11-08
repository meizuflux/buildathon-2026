<p align="center">
  <img src="frontend/public/haven-mark.svg" alt="Haven logo" width="200" height="200" />
</p>

<h1 align="center">Haven</h1>

<p align="center">Disaster response coordination for government operations teams and relief partners.</p>

Haven is a disaster response coordination project. It brings together a government operations dashboard, a partner portal for shelters and relief organizations, and an API for managing households, shelters, plans, supplies, and response activity.

## Project structure

- [`backend/`](backend/) — Litestar API with an SQLite database, authentication, shelter allocation, and logistics endpoints.
- [`frontend/`](frontend/) — React/Vite operations dashboard.
- [`3rdparty/`](3rdparty/) — React/Vite partner portal.

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

To start the partner portal in another terminal:

```sh
cd 3rdparty
npm install
npm run dev
```

Open http://localhost:5174. Its development server forwards `/api` to http://127.0.0.1:8000 by default; set `HAVEN_API_URL` to change that target. **The partner portal depends on partner-specific API functionality that is not currently implemented in the backend.**

## Demo data

With the API stopped, recreate the disposable demo database and accounts:

```sh
cd backend
just demo-data
```

Every run deletes and rebuilds the configured SQLite database and prints fresh demo passwords. Restart the API and sign in with those credentials. The scenario places 1,000 synthetic households at actual houses in Golden Gate Estates, Naples, and seven simulated shelters at local school sites. Household profiles and shelter operations are fictional and must not be used for real emergency response. See the [backend README](backend/README.md#demo-data) for details.

## Development and checks

The backend initializes its schema and applies migrations on startup. Its default database is `disaster_response.sqlite3` in the working directory; set `DATABASE_PATH` to use another file. To initialize it without starting the server, run `just schema` from `backend/`.

```sh
# Backend lint, formatting, type checks, and tests
cd backend
just check

# Dashboard production build
cd ../frontend
npm run build

# Partner portal production build
cd ../3rdparty
npm run build
```

See the [backend README](backend/README.md) for API, authentication, and allocation details, and the [dashboard README](frontend/README.md) and [partner portal README](3rdparty/README.md) for component-specific information.
