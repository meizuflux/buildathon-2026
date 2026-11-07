# Haven · Your household, connected

A frontend-only disaster coordination app built with React Native, Expo SDK 54, TypeScript, Expo Router, TanStack Query, and native Expo SQLite persistence. Includes an adaptive browser preview, optional Expo Location, SecureStore token integration, and NetInfo connectivity detection. No backend or matching algorithm is included. Support messages require an authenticated backend implementing the message API described below.

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
3. Open Support, write a message, and send it to the connected coordination service. Until a backend is configured, messages remain local drafts.
4. Report your situation. Receipt by the coordination service is separate from any organization acknowledgment.
5. Edit Household on one scrollable page. People, pets, support needs, transportation, and address remain visible without stepping through the initial survey.
6. Disconnect networking after loading information. Cached sections remain visible with offline warnings. Save a report draft; reconnect, open the draft, review, and explicitly submit it.
7. Edit the household via Household → Edit household. Personal preparation checkmarks are stored per household and do not modify official assignments.

The default local mode keeps household profiles and drafts on the device. Fabricated alerts, updates, and assignments are excluded from the normal UI; connect an API backend to load those records. Test fixtures are used only by service tests and the isolated browser audit.

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

For the browser audit, start Expo in API mode with EXPO_PUBLIC_API_BASE_URL=http://localhost:8799, then run npm run design:audit in another terminal. The script intercepts that test origin with isolated fixtures; it never contacts a live coordination team. It checks all screens at mobile and desktop widths, single-page edits, message draft restoration, send failures/retries/acknowledgments, incoming replies, and night mode. CHROME_PATH and HAVEN_AUDIT_URL override the browser and app origin. Screenshots and results are written to .hallmark/screens/.

Tests cover household creation/editing/restoration, all demo event payloads, submission status semantics, idempotency, version history, unavailable shelters, long-poll wake/cursor/deduplication/cancellation, persisted snapshots, HTTP auth/errors/validation/cancellation/timeouts. Native permission dialogs and device SQLite behavior still require an iOS/Android device smoke test.

The app does not independently recommend routes, generate evacuation instructions, assign resources, or call government APIs. Consult official emergency services in immediate danger; Haven is not dispatch.

## Survey map mobile design

A single mobile column, IBM Plex Sans typography, and a high-contrast Ice White canvas. Day/night controls are available in the header and Household > Appearance. Night mode uses canvas #0D1117 and text #F0F6FC; alert Crimson #D9381E and Amber #E67E00 are fixed across both modes. Warning panels use left borders with readable neutral text.

Initial setup uses the survey; editing an existing household shows all fields together with one Save changes action. The survey asks for total people (including children) and number of children first. Pets have per-type counters and an Other option. Enter a full street address or explicitly share current location. Editing an address clears stale coordinates. Legacy names and resource fields remain in the API contract for compatibility but are not collected by this survey. New profiles use the internal label My household. Pet details are optional structured metadata alongside the legacy total and description.

My plan now focuses on the assigned shelter, status, address, and map. React Native Maps powers mobile; Leaflet with OpenStreetMap tiles powers the browser. The backend can provide optional shelter coordinates. Missing coordinates retain the address and external-map fallback. Straight-line distance is shown only when both locations are known; it is not road distance or a safe route. Manual addresses are not automatically sent to third-party geocoders. In API mode, use current location to estimate distance when household coordinates are missing.

Normal app views do not show demo captions or generated incident data. Local mode shows empty alert/assignment states. Production alerts still require backend integration; push notifications and geographic hazard boundaries are not included.

Nearby includes separate hurricane and storm filters. The safety status action is hidden for hurricanes and remains available for other hazard categories. Support includes a Call 911 action that opens the phone dialer; browser/device support varies.

### Native map setup

Expo Go can preview React Native Maps. For a standalone Android build, set GOOGLE_MAPS_ANDROID_API_KEY in the build environment to an Android Maps SDK key restricted to your app package/signing certificate. app.config.ts injects it into android.config.googleMaps.apiKey. Without a configured key, standalone Android displays the shelter address and a map-app fallback rather than mounting a map that cannot initialize. iOS uses Apple Maps by default. See [Expo map setup](https://docs.expo.dev/versions/latest/sdk/map-view/).

The browser map uses public OpenStreetMap tiles and displays attribution. Map tiles require network access; offline shelter addresses remain visible. Use a suitable tile service for production traffic.

The browser audit also verifies survey validation, per-type pets, save/edit restoration, the hurricane safety-action exception, and persisted night mode. Device permission dialogs, native map rendering, and dialer handoff still need a physical-device smoke test.

## Support messages

The Support tab replaces request forms with a conversation and pinned composer. Old request URLs redirect to Support. Messages are sent through the authenticated HTTP client to GET/POST /api/v1/messages. The service must return the accepted message with the same body and idempotencyKey before the UI labels it Sent. This means accepted by the service, not read by a staff member. Failed sends retain the draft and key for retry; no fake acknowledgments or replies are generated.

Drafts are stored per household, backend origin, and data mode. They are never auto-sent. Incoming messages refresh through message change events, foreground polling, and manual refresh. Local mode permits drafting and disables Send. Set EXPO_PUBLIC_DATA_MODE=api and EXPO_PUBLIC_API_BASE_URL to connect a backend that implements the documented contract. No support messaging server or staff destination is supplied in this repository.
