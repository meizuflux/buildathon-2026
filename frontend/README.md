# Haven · Your household, connected

A frontend-only disaster coordination app built with React Native, Expo SDK 54, TypeScript, Expo Router, TanStack Query, and native Expo SQLite persistence. Includes an adaptive browser preview, optional Expo Location, SecureStore token integration, and NetInfo connectivity detection. No backend or matching algorithm is included.

## Run

Use Node.js 20.19+ (Node 22 recommended).

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm start
```

Use a compatible Expo Go SDK 54 client or an Expo development build on your device/emulator. Match the client SDK to this project's SDK; see [Expo's compatibility guide](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/). Android: `npm run android`. iOS simulator: `npm run ios` on macOS with Xcode. Browser: `npm run web` or press `w` in Expo CLI. No native build is required for the browser preview.

## Try the complete flow

1. Open Home and choose **Set up my household**. Complete the five steps, review, and save.
2. Review your sample plan, source labels, assignments, unmet needs, and preparation checklist.
3. Request assistance, review exactly what is shared, submit, and inspect the request timeline.
4. Report your situation. Receipt by the coordination service is separate from any organization acknowledgment.
5. In a development session, open Household → Demo playground. Load household A, B, or C and trigger events. The adapter emits change notifications; synchronization refreshes shared queries. Selecting a household clears the mock requests/reports/history for that scenario.
6. Disconnect networking after loading information. Cached sections remain visible with offline warnings. Save a report draft; reconnect, open the draft, review, and explicitly submit it.
7. Edit the household via Household → Edit household. Personal preparation checkmarks are stored per household and do not modify official assignments.

All alerts, names, locations, shelter availability, instructions, and assignments in mock mode are **fictional**, even when their simulated source is marked verified. Demo mode is the default and is visibly labeled. Scenario buttons appear only when both `__DEV__` and mock mode are true. Fresh demo installs start without a profile so onboarding can be demonstrated.

## Connect the backend

Set in `.env` and restart Expo (clear Metro cache with `npx expo start --clear` if necessary):

```dotenv
EXPO_PUBLIC_DATA_MODE=api
EXPO_PUBLIC_API_BASE_URL=https://your-team-backend.example
EXPO_PUBLIC_CHANGES_PATH=/api/v1/changes
```

Use a backend origin your phone can reach. `localhost` on a phone refers to the phone; a LAN development backend must bind to an appropriate interface and permit device traffic. These environment variables are public bundle configuration; never put secrets in them. The backend must allow the browser origin through CORS for web preview.

The [integration contract](docs/backend-integration.md) describes proposed routes, exact payloads, validation, statuses, and change cursors. Align with the backend team's OpenAPI document before real deployment. Configure all paths in `src/services/api/endpoints.ts`; replace or adapt only `BackendAdapter` for a different response envelope.

Authentication is intentionally an integration seam. The default mock session uses no real token. The backend's login flow should call `session.setToken(token)`; native tokens use SecureStore and web tokens remain in memory. No production login scheme is supplied. A 401 is displayed as an expired-session error. Integrating account switching/logout must also clear the query client, local household caches/drafts, and previous session token before a different user signs in.

## Storage and synchronization

- Native cache: SQLite `haven.db`, key/value table with parameterized SQL. Web preview: localStorage, avoiding SQLite WebAssembly/COOP/COEP requirements.
- Cached query data includes the household, plans, details, requests, reports, alerts, updates, and original fetch timestamps. Query snapshots and drafts are separated by mode/backend origin; draft/checklist keys also identify the household.
- The last successful **full refresh** appears in the header. Individual critical items show the source timestamp. Offline and failed refresh warnings qualify saved assignments as potentially outdated.
- One abortable 20-second long poll runs in foreground while connected. Event IDs are deduplicated; affected queries are invalidated; plan events also refresh history. Failures use exponential backoff with jitter (up to 60 seconds). Backgrounding/disconnecting aborts the poll. Foreground/reconnect performs a full refresh and starts a new cursor session. A disabled/404/405/501 endpoint stops polling and exposes manual refresh.
- No sensitive draft is auto-submitted. Assistance/report retries reuse their original idempotency keys. The server must honor these keys across timeouts. Mutations are not retried automatically.
- Household data and drafts are **not encrypted by this app** in SQLite or browser storage. Keep the device protected and minimize sensitive details. Only native authentication tokens use SecureStore. A production privacy/retention policy and account lifecycle should be agreed with the backend team.

## Validate

```powershell
npm run typecheck
npm test
npx expo install --check
npm run build:web
```

For the design smoke test, start Expo first, then run `npm run design:audit` in another terminal. It uses an isolated headless Chrome profile and fictional demo fixtures to check all nine screens at mobile and desktop widths, plus assistance submission and report receipt. Set `CHROME_PATH` if Chrome is installed somewhere other than the default Windows location; set `HAVEN_AUDIT_URL` if Expo uses a different port. Captures and results are written to `.hallmark/screens/` at the repository root.

Tests cover household creation/editing/restoration, all demo event payloads, submission status semantics, idempotency, version history, unavailable shelters, long-poll wake/cursor/deduplication/cancellation, persisted snapshots, HTTP auth/errors/validation/cancellation/timeouts. Native permission dialogs and device SQLite behavior still require an iOS/Android device smoke test.

The app does not independently recommend routes, generate evacuation instructions, assign resources, or call government APIs. Consult official emergency services in immediate danger; Haven is not dispatch.

## Survey map mobile design

The mobile interface uses Contour Paper, Deep Survey Ink, Strata Teal, Ember Orange, and Silt tokens in `src/constants/theme.ts`, with bundled IBM Plex Sans and IBM Plex Mono fonts. Layouts remain a single mobile column, including browser previews.

Nearby sorts alerts by severity, then update time, with filters for storms, floods, fire, and earthquakes. Filters show only alerts returned by the configured adapter; empty results do not establish safety. Mark myself safe opens the report review and submission flow. Its receipt and last submitted status come from the existing reports service.

The area illustration is explicitly a schematic, not a geographic map. It has no live boundaries, device-location marker, distances, or navigation routes. Production alerts still require the backend integration described above; push notifications and a geographic hazard feed are not included.
