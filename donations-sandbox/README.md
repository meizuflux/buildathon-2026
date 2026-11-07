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

The Citizen app tab has a **Phone location** switch: *Simulated* places the phone in Bukit Duri, Jakarta (so the demo works anywhere), and *Real device GPS* uses the browser's location.

## Demo walkthrough

1. **Citizen app** (`family@demo.example`): filter hubs with "I want to donate" → Formula, open GOR Senen, and pledge. Then go to **Request supplies** and send a request.
2. **Hub staff** (GOR Senen): the pledge shows under Expected drop-offs. Click **Received** and watch On hand go up and Still needed go down.
3. **Government dashboard** (`government@demo.example`): check the map and the over-capacity table, and dispatch a pickup. Under **Citizen requests**, claim the new request from a suggested hub, then **Mark delivered** under My assignments.
4. **Citizen app → My activity**: the request shows Done and the pledge shows Received.
