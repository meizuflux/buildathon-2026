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
| `DonationsTab` | Government view with three sections: **Hubs & transport** (map plus over-capacity table), **Citizen requests** (queue plus my assignments), and **Custom items** |
| `HubMap` | Leaflet/OpenStreetMap map. Hubs are colored and sized by capacity, open requests appear as blue dots, and each hub's popup can dispatch transport |
| `OverCapacityHubs` | Hubs at or above 70, 80 or 90% capacity, with **Dispatch Transport Pickup**. **Mark cleared** moves the hub's surplus to the nearest depot and reports what moved |
| `RequestQueue` | Citizen requests already matched to a hub, with the reasons. Choose delivery or pickup, then claim. Requests waiting for stock are listed separately |
| `CustomReview` | Incoming custom donations and requests (items outside the standard list), with the nearest hubs suggested. Pick a hub and write instructions to approve, or give a reason to decline. Approved items get **Mark completed** |
| `MyAssignments` | The worker's claimed requests: where to collect, where to deliver, a directions link, and **Mark delivered**/**Mark picked up** (which deducts stock) or **Release to queue** |
| `HubStaffConsole` | One hub's live stock, % full, and demand-driven targets (all automatic), incoming pledges, and the walk-in form |
| `PledgeInbox` | Pending drop-offs for a hub. **Received** adds the items to inventory |
| `WalkInForm` | Log goods that arrived without a pledge: pick an item and quantity, add it, then log the drop-off. The only manual stock entry |

Common props: `token` and `apiBase` (defaults to `VITE_API_BASE`, then `http://127.0.0.1:8000`).

Dependencies: Tailwind CSS (include `src/donations/**/*.jsx` in `content`), plus `leaflet@1.9.4` and `react-leaflet@4.2.1` for `HubMap`. Run it through `donations-sandbox/`.
