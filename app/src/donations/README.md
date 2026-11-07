# Donation hubs (React Native)

`NearbyHubs` is a drop-in card list of donation hubs near a point, showing capacity, a "Full" badge at 90% or more, and open needs. It needs no dependencies beyond `react-native`.

```jsx
import NearbyHubs from './src/donations/NearbyHubs';

<NearbyHubs lat={coords.latitude} lng={coords.longitude} apiBase="http://192.168.1.20:8000" />
```

| Prop | Default | Notes |
|---|---|---|
| `lat`, `lng` | Demo center (Houston) | Pass device location once the app has it |
| `apiBase` | `http://127.0.0.1:8000` | On a phone, use your computer's LAN IP |
| `radiusKm` | `25` | |
| `onSelectHub(hub)` | — | Called on card press |

Render it inside a container with `flex: 1`, because it is a `FlatList`. Pull to refresh.
