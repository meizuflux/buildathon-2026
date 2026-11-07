# Donations (React Native)

The citizen side of donation distribution has four tabs: **Donate**, **Request**, **Custom**, and **My activity**. Citizens never pick a hub. They say what they have or need, and the server matches them to the best hub.

```jsx
import CitizenDonations from './src/donations/CitizenDonations';

<CitizenDonations token={session.access_token} apiBase="http://192.168.1.20:8000" />
```

| Component | What it does |
|---|---|
| `CitizenDonations` | The full tab with all four screens |
| `DonateForm` | Pick items, then the server chooses the best drop-off hub: one nearby that needs those items and isn't nearly full. Shows "Drop off at X", why it was chosen, and a directions link |
| `RequestForm` | Pick items, then the request is matched to the best hub straight away and the items are set aside. A response worker delivers or arranges pickup. If no hub has the items, the request waits and is matched automatically when stock arrives |
| `CustomForm` | For items outside the standard list (e.g. a wheelchair or a crib). The citizen chooses whether they need it or want to donate it, describes it, and sends it for review. A government worker replies with a hub and instructions. Each person can have one custom item awaiting review at a time |
| `MyActivity` | The citizen's requests (waiting, matched, on the way, done) and drop-offs, plus custom items with the reviewer's hub and message, with cancel buttons |

Common props: `token` (a `family` bearer token) and `apiBase` (default `http://127.0.0.1:8000`; on a phone, use your computer's LAN IP).

**Location** comes from the device GPS. `location.native.js` uses `expo-location` (install it with `npx expo install expo-location`), and `location.js` uses browser geolocation on web. Donations and requests can't be sent without a location fix; if location is denied, the form offers a retry. Pass `location={{ lat, lng }}` to `CitizenDonations` to simulate a position.

**Items:** citizens choose from 13 resource types. Clinical items (insulin, prescription refills, oxygen) are handled by operators only.

**Request limit:** the request form shows how many more requests the person can open. The limit is 3 by default and adjusts with demand for the items picked; Send is disabled at the limit.

Render it inside a container with `flex: 1`. To try it in a browser, use `donations-sandbox/`.
