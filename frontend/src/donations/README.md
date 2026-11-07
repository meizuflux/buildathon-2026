# Donation hubs (dashboard)

`OverCapacityHubs` is a Tailwind-styled table of hubs at or above a capacity threshold (70, 80 or 90%), with a **Dispatch Transport Pickup** button. It polls every 30 seconds.

```jsx
import OverCapacityHubs from './donations/OverCapacityHubs';

<OverCapacityHubs token={session.access_token} />
```

| Prop | Default | Notes |
|---|---|---|
| `token` | — | Operator bearer token from `POST /api/auth/login`; required to dispatch |
| `apiBase` | `VITE_API_BASE` or `http://127.0.0.1:8000` | |
| `pollMs` | `30000` | |

Requires Tailwind CSS. Make sure Tailwind's `content` globs include `src/donations/**/*.jsx`.
