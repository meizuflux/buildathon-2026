# Haven

The `app` branch contains the Expo React Native mobile app and an unchanged copy of the backend from `origin/master` commit `1d3c8ee`.

Set up the backend from the repository root:

```powershell
uv sync --project backend --locked --python 3.14
cd frontend
npm install
npm run backend:seed
npm run backend:start
```

In another terminal, run `cd frontend` and `npm start`. Open `http://localhost:8081` and choose **Create an account**. The local API listens on port 8000. The seed command uses the backend's fictional Tampa test scenario in an isolated local database.

See the [mobile app README](frontend/README.md) for phone/emulator URLs, authentication, API mapping, verification commands, and backend limitations. Run `npm run backend:verify` from `frontend` to confirm the imported backend source is unchanged.
