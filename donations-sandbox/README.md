# Donations sandbox

A dev harness that runs the donation components from `app/src/donations/` (through react-native-web) and `frontend/src/donations/` against the local Haven API. It has three tabs, each with its own sign-in: **Citizen app** (in a phone frame), **Hub staff**, and **Government dashboard**.

```sh
# Terminal 1: API with demo data (every demo account gets the same password)
cd backend
DEMO_PASSWORD=demo-password-2026 just demo-data
just dev

# Terminal 2: sandbox at http://localhost:5173
cd donations-sandbox
npm install
npm run dev
```

On PowerShell, set the password first with `$env:DEMO_PASSWORD = "demo-password-2026"`. If you seeded before adding hub staff, delete `backend/disaster_response.sqlite3` and seed again.

Set `VITE_API_BASE` if the API isn't at `http://127.0.0.1:8000`.

The Citizen app tab has a **Phone location** switch: *Simulated* places the phone in Sulphur Springs, Tampa (so the demo works anywhere), and *Real device GPS* uses the browser's location.

## Demo walkthrough

1. **Citizen app** (`family@demo.example`). Under **Donate**, add baby formula and diapers and tap *Find where to drop off*. The app names the hub and explains why it was chosen. Under **Request supplies**, add some bottled water and send it; it's matched to a hub at once. Request a generator too: no hub has one, so it shows *Waiting for supplies*.
2. **Hub staff** (sign in as the hub the donation was matched to). The donation shows under Expected drop-offs. Click **Received** and watch On hand go up and Still needed go down.
3. **Government dashboard** (`government@demo.example`). Under **Citizen requests**, each request already has its matched hub and the reasons. Choose delivery or pickup, claim it, then click **Mark delivered** under My assignments. Under **Hubs & transport**, check the map and dispatch a pickup for a full hub.
4. **Custom items**: in the citizen app's **Custom** tab, ask for a wheelchair. Under the government dashboard's **Custom items**, pick a hub, write instructions, and approve it. The citizen sees the hub and message in My activity.
5. **Citizen app → My activity**: the water request shows Done, the generator request is waiting, and the donation shows Received.
