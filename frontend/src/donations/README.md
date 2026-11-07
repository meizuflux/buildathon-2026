# Donations (dashboard)

React components styled with Tailwind for the government and hub staff side of donation distribution.

```jsx
import DonationsTab from './donations/DonationsTab';
import HubStaffConsole from './donations/HubStaffConsole';

<DonationsTab token={session.access_token} />                    // operator
<HubStaffConsole hubId={me.hub_id} token={session.access_token} />  // hub_staff
```

| Component | What it does |
|---|---|
| `DonationsTab` | Government view with three sections: **Hubs & transport** (map plus over-capacity table), **Citizen requests** (queue plus my assignments), and **Edit a hub** |
| `HubMap` | Leaflet/OpenStreetMap map. Hubs are colored and sized by capacity, open requests appear as blue dots, and each hub's popup can dispatch transport |
| `OverCapacityHubs` | Hubs at or above 70, 80 or 90% capacity, with **Dispatch Transport Pickup** and **Mark cleared** |
| `RequestQueue` | Citizen requests already matched to a hub, with the reasons. Choose delivery or pickup, then claim. Requests waiting for stock are listed separately |
| `MyAssignments` | The worker's claimed requests: where to collect, where to deliver, a directions link, and **Mark delivered**/**Mark picked up** (which deducts stock) or **Release to queue** |
| `HubStaffConsole` | One hub's live summary, incoming pledges, and check-in form |
| `PledgeInbox` | Pending drop-offs for a hub. **Received** adds the items to inventory |
| `HubInventoryEditor` | Check-in: capacity slider plus on-hand and target counts. Pass `hubId` to lock it to one hub |

Common props: `token` and `apiBase` (defaults to `VITE_API_BASE`, then `http://127.0.0.1:8000`).

Dependencies: Tailwind CSS (include `src/donations/**/*.jsx` in `content`), plus `leaflet@1.9.4` and `react-leaflet@4.2.1` for `HubMap`. Run it through `donations-sandbox/`.
