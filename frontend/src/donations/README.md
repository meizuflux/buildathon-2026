# Donation hubs (dashboard)

Drop-in React components styled with Tailwind. The quickest integration is the full tab:

```jsx
import DonationsTab from './donations/DonationsTab';

<DonationsTab token={session.access_token} />
```

| Component | What it does |
|---|---|
| `DonationsTab` | Over-capacity table and hub check-in form side by side. Saving a check-in refreshes the table |
| `OverCapacityHubs` | Hubs at or above 70, 80 or 90% capacity. **Dispatch Transport Pickup** sends a truck; **Mark cleared** completes the pickup and resets the hub to `clearedCapacityPct` (default 25). Polls every 30 seconds |
| `HubInventoryEditor` | Hub check-in: storage slider plus on-hand and target counts for each supply category. Pass `hubId` to lock it to one hub; otherwise it shows a hub picker |

Common props: `token` (an operator bearer token from `POST /api/auth/login`, required for every write) and `apiBase` (defaults to `VITE_API_BASE`, then `http://127.0.0.1:8000`).

Requires Tailwind CSS. Make sure Tailwind's `content` globs include `src/donations/**/*.jsx`.
