# Donations (React Native)

The citizen side of donation distribution. It uses only `react-native` primitives and needs no extra dependencies.

```jsx
import CitizenDonations from './src/donations/CitizenDonations';

<CitizenDonations token={session.access_token} lat={coords.latitude} lng={coords.longitude} apiBase="http://192.168.1.20:8000" />
```

| Component | What it does |
|---|---|
| `CitizenDonations` | The full tab: Find hubs, Request supplies, My activity |
| `NearbyHubs` | Hub cards nearest first, with capacity, needs, and stock on hand. Filters: "I want to donate" (hubs that need a category) and "I need supplies" (hubs that have it). Public, no token |
| `PledgeForm` | Pledge a drop-off at a hub, prefilled with that hub's needs. Full hubs (90% or more) refuse pledges |
| `RequestForm` | Ask for supplies; a government worker delivers them or sets them aside for pickup |
| `MyActivity` | The citizen's requests and pledges, with status and cancel buttons |

Common props: `token` (a `family` bearer token, required for pledges, requests, and activity), `apiBase` (default `http://127.0.0.1:8000`; on a phone use your computer's LAN IP), and `lat`/`lng` (default: the Houston demo center).

Render inside a container with `flex: 1`. Run it in a browser through `donations-sandbox/`.
