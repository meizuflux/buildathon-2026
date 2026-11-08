# Haven mobile app

React Native / Expo SDK 54 household app connected to the Litestar API in `backend/`.

## Resident dashboard demo

A deterministic, offline demo of the resident-facing "Your household plan" dashboard. It needs no backend and no sign-in.

```sh
npm run demo            # Expo web dev server with simulated data
npm run demo -- export  # static build in dist-demo/
```

- **Scenario:** the fictional Alvarez household (2 adults, 2 children, 1 dog, a wheelchair-accessible entrance need, a vehicle) and three fictional shelters near Seminole Heights, Tampa Bay. Lakeview Recreation Center is recommended at the start.
- **Layout:** a mobile app with five bottom tabs:
  - **Plan:** official instruction, recommendation, journey and other options.
  - **Prepare:** the checklist.
  - **Updates:** official broadcasts and plan changes.
  - **Messages:** the coordinator chat.
  - **Household:** members and needs, edited in place, plus the account.

  On a wide browser window the app renders inside a phone frame.
- **Presenter controls:** open them from the dark "Demo — simulated conditions" button. They let you:
  - change the wheelchair requirement
  - trigger road closures, broadcasts and availability updates
  - go offline, advance time (stale data), or make the next message fail
  - reset
- **What the dashboard never does:** it does not reserve a space or claim a placement, does not claim messages were delivered or read, and does not invent emergency numbers. Coordinator replies are labelled as simulated.
- **Where the code lives:**
  - Rules and state: `src/demo/`. `recommend.ts` is a pure rule function with no scores; tests are in `tests/resident-demo.test.ts`.
  - UI: `src/components/dashboard/` and `src/screens/PlanDashboard.tsx`.
- **Mode:** the dashboard replaces the app shell only when `EXPO_PUBLIC_DATA_MODE=mock`. The default `api` mode is unchanged.

### Live mode (backend on master)

```sh
# from the repository root, once: seed fictional demo data with a known password
cd backend && DATABASE_PATH=../.runtime/live-demo.sqlite3 DEMO_PASSWORD=demo-password-2026 uv run --locked python -c "import asyncio; from haven.demo_data import main; asyncio.run(main())"
DATABASE_PATH=../.runtime/live-demo.sqlite3 uv run --locked litestar --app haven.app:app run --port 8000
# then, in app/
npm run demo:live        # sign in as family@demo.example
```

`family@demo.example` has a seeded household (the backend seeds it; see [../docs/hurricane-demo.md](../docs/hurricane-demo.md)). The app follows the hurricane status, polled every 5 seconds: in peace the Plan tab shows "All clear" and the needs on file, with no shelter. When an operator initiates the hurricane from the government dashboard, the app switches within about 5 seconds to the evacuation order, jumps to the Plan tab and shows the shelter assignment; resetting returns it to All clear. If the status request fails, the app keeps the last known phase.

The same dashboard reads the signed-in family's profile, plan, shelters and official updates from the API:

- **Who decides:** the backend's allocation plan picks the destination, so the resident app and the government dashboard agree. The local rules only explain why the other shelters weren't chosen.
- **Edits:** editing household needs sends `PATCH /api/families/{id}`, then `POST /plan/generate`.
- **Messages:** they go to coordinators as `need_help` reports.
- **"Space counted for you":** this label comes from the plan's `capacity_reserved` flag. It is still not shown as a confirmed placement.
- **Not provided by the backend, so not shown:** road closures, routes and travel times. The journey shows a labelled straight-line distance instead.
- **Messages one way only:** the backend has no coordinator replies.
- **Needs stored as text:** wheelchair and powered-equipment needs live in the backend's free-text notes. Any accessibility note means the backend requires a wheelchair-accessible shelter.
- **New accounts:** a household is placed at the centre of the listed shelters, because demo accounts have no address.
- **Kept on the device:** checklist ticks and "We've left".

## Start the app with the real backend

From the repository root, install [uv](https://docs.astral.sh/uv/getting-started/installation/) if needed, then:

```powershell
uv sync --project backend --locked --python 3.14
cd app
npm install
npm run backend:seed
npm run backend:start
```

If using the workspace-local uv already installed for this session, replace the first command with `.\.runtime\uv\uv.exe sync --project backend --locked --python 3.14` from the repository root.

In another terminal:

```powershell
cd app
npm start
```

Press `w` for the browser. The API is at `http://127.0.0.1:8000`, its health check is `/health`, and the browser app is at `http://localhost:8081`. The local `.env` is configured for this backend. `backend:start` adds browser CORS support and stores data in `.runtime/haven.sqlite3`. Set `DATABASE_PATH` to choose another database. Loopback browser origins (localhost, 127.0.0.1, and ::1) on any port are allowed by default so Expo can select an available port; `HAVEN_ALLOWED_ORIGINS` accepts a comma-separated override.

Python 3.14 is required by the current master code in practice: earlier Python versions eagerly evaluate APSW type-only annotations. The lockfile and backend source are not changed to address this. The workspace-local uv download is ignored by git.

With the API stopped, `backend:seed` recreates this disposable database with the Golden Gate Estates scenario: 1,000 synthetic households at real house locations and seven simulated shelters at local school sites. It prints credentials for the demo family and operator accounts; existing data and sessions are discarded. Start the API, sign in with the printed family credentials or choose **Create an account**, then fill out the household survey. The backend automatically allocates a shelter after saving. Coordinates around latitude `26.25`, longitude `-81.58` are convenient test inputs for this scenario. Household profiles and shelter operations are fictional.

## Test on a phone or emulator

Set `EXPO_PUBLIC_API_BASE_URL` in `.env` to `http://<your-computer-LAN-IP>:8000` for a phone on the same Wi-Fi, or `http://10.0.2.2:8000` for the standard Android emulator. Restart Expo with `npx expo start --clear` after changing the URL. A phone's localhost refers to the phone, not this computer. The development backend listens on all local interfaces; Windows Firewall must permit the connection if prompted. Use HTTPS for a deployed backend.

## What is connected

- Register/login/logout use `/api/auth/*` and `/api/me`. Family accounts are required. Native tokens use SecureStore; browser tokens use sessionStorage for same-tab reloads. Query snapshots are scoped to the account and backend origin.
- Household create/edit maps to `POST /api/families` and `PATCH /api/families/{id}`. Select an active disaster and supply coordinates, either explicitly or using current location. Editing remains one scrollable page.
- My plan reads the actual persisted allocation, shelter location, and warnings from `/api/families/{id}/plan`. Critical mismatch and overflow warnings are preserved. Instructions come from the backend; map distance is straight-line distance, not a route.
- Nearby lists active disasters from `/api/disasters`; these records are not automatically described as official warnings. Updates use the authenticated disaster update feed, including targeted shelter updates. The operator-only operational alert feed is not accessed with a family account.
- Support messages and situation reports are submitted to `POST /api/families/{id}/reports`. The server's `received` status is required before the app says Sent. Stable `client_request_id` values make retries idempotent. Operators can see them in `/api/disasters/{id}/reports`.
- This master backend does not expose two-way chat or a family report-history endpoint. The app keeps confirmed receipts on this device and does not invent replies. It checks for refreshed household/plan/update data every 10 seconds while active and online.

The backend stores people counts, coordinates, pet presence, care notes, and car availability. Detailed pet counts, street-address text, and the transportation preference remain on this device because the backend has no dedicated fields for them. They are not hidden inside clinical notes, where they could incorrectly affect allocation. Send transportation help through Support. Medication urgency is sent only when explicitly selected.

## Verify

With the backend running and seeded:

```powershell
npm run typecheck
npm test
npm run test:backend
npm run test:backend:ui
npm run build:web
```

`test:backend` creates isolated local test accounts and verifies real HTTP profile/plan/report operations, operator report visibility, idempotency, authorization, and logout. `test:backend:ui` drives the mobile-sized app against that actual server, with no mocked API calls. Screenshots and results are in `.hallmark/screens/`. These checks create records in the local test database; do not point them at a production service.

Run the original backend tests from the repository root with `backend\.venv\Scripts\python.exe -m pytest backend/tests -q` on Windows. Native map rendering, location permission dialogs, and the 911 dialer still need a device smoke test. Android standalone maps require `GOOGLE_MAPS_ANDROID_API_KEY` at build time; Expo Go can preview the native map. The browser uses Leaflet and OpenStreetMap with attribution.

The interface uses IBM Plex Sans, a single mobile column, and the Survey map day/night palette. The app is not emergency dispatch. In immediate danger, contact official emergency services.
