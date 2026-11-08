# Haven mobile app

React Native / Expo SDK 54 app for households in an emergency. It answers three questions: where to go, why it fits the household, and what to do next. It talks to the Haven API in `backend/`.

## Run it

Start the backend first. See [`backend/README.md`](../backend/README.md); the API listens on `http://127.0.0.1:8000`.

```sh
cd app
npm install
npm start          # Expo dev server on http://localhost:8081
```

- Press `w` for the browser.
- Scan the QR code with Expo Go for a phone. On a phone, set `EXPO_PUBLIC_API_BASE_URL` in `.env` to your computer's LAN IP (see `.env.example`), then restart with `npx expo start --clear`.

Sign in with a family account, or choose **Create an account**. An account without a household profile is asked to set one up first.

## What's in the app

Five tabs:

- **Plan:** the latest official instruction, the recommended shelter, the household's needs matched against it, availability, a map and straight-line distance, and the other shelters with why they weren't chosen.
- **Prepare:** a checklist based on the household. Ticks are kept on the device and cleared when the hurricane returns to peace.
- **Updates:** official broadcasts, and notices when the plan changes.
- **Messages:** messages to the coordination desk.
- **Household:** members and needs, editable in place, plus sign-out.

## How it uses the backend

| App | API |
|---|---|
| Sign in, register, sign out | `/api/auth/*`, `/api/me` |
| Household | `GET`, `POST`, `PATCH` `/api/families` |
| Recommendation | `GET /api/families/{id}/plan`. After an edit, `POST /api/families/{id}/plan/generate`. |
| Shelters | `GET /api/shelters?disaster_id=…` |
| Hurricane phase | `GET /api/disasters/{id}/hurricane` |
| Official updates | `GET /api/disasters/{id}/updates` |
| Messages | `POST /api/families/{id}/reports` (`need_help`, idempotent `client_request_id`) |

Data refreshes every 30 seconds. If the backend can't be reached, the app keeps showing the last data it loaded and marks it as saved, with the time.

### Who picks the shelter

The backend's allocation plan picks the shelter. The app's rules in `src/resident/rules.ts` only explain how the plan fits the household's needs, and why the other shelters weren't chosen.

### What the app never says

- **No confirmed placement:** "Recommended", "availability reported" and "space counted in the coordinators' plan" are shown separately.
- **No delivery claims:** messages are only "Sent" or "Not sent", never delivered or read.

### Limits of the current backend

- **No routes:** it has no road closures, routes or travel times, so the app shows a labelled straight-line distance.
- **No replies:** coordinator replies aren't available, so messages are one-way.
- **Needs stored as text:** wheelchair access, powered equipment and transport help are stored in the free-text `accessibility_notes` and `other_special_care` fields. Any accessibility note makes the backend require a wheelchair-accessible shelter.
- **No backup power data:** shelters don't report backup power, so that need always shows as unconfirmed.
- **No address entry:** new households are placed at the centre of the listed shelters.

## Code

- `src/app/`: Expo Router entry. Fonts, theme and auth providers, then sign-in or the app.
- `src/resident/`: the app's data and logic, with no UI.
  - `api.ts`: backend schemas and mapping.
  - `rules.ts`: needs checks and the "What changed" text.
  - `checklist.ts`, `time.ts`.
  - `provider.tsx`: loading, refreshing and saving.
- `src/components/resident/`: the UI.
- `src/screens/ResidentApp.tsx`: the tab shell.

## Check

```sh
npm run typecheck
npm test           # API mapping, needs rules, checklist, color contrast (WCAG AA)
npm run build:web
```

The app is not emergency dispatch. In immediate danger, contact official emergency services.
