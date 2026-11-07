# Integration with master

The app branch imports the backend unchanged from origin/master commit `1d3c8ee8535951a7443e2d3511d96f3bf03a7b7d`. Run `npm run backend:verify` to compare source files. The stale local master branch is intentionally not reset, merged, or otherwise modified.

The API source of truth is `backend/src/haven/openapi.py` and `backend/src/haven/routers`. `src/services/api/masterSchemas.ts` validates its response shapes. `src/services/adapters/masterAdapter.ts` translates those shapes into the mobile app models. The previous proposed `/api/v1` endpoints are not used by the connected adapter.

Authentication uses POST /api/auth/register, POST /api/auth/login, GET /api/me, POST /api/auth/logout. Send Bearer tokens; the logout response is an empty 204. Only family accounts can create their own household; operator credentials are not embedded in the app.

GET /api/me provides family_id. POST /api/families creates a profile; GET/PATCH /api/families/{family_id} reads or changes it. Payload fields are disaster_id, adults, children, location (latitude and longitude), needs, and resources.has_car. Unknown fields are rejected by the backend. The app keeps additional presentation details in family-scoped device storage instead of overloading backend allocation notes.

GET /api/disasters supplies active disasters. GET /api/families/{family_id}/plan returns the persisted allocation, selected shelter and location, instructions, version, and alerts. All warning/critical plan alerts are retained in the UI. GET /api/disasters/{disaster_id}/updates returns the authenticated audience's updates. Family clients do not call the operator-only alerts/report-list endpoints.

Support messages are family reports with type need_help; situation updates use status_update. POST /api/families/{family_id}/reports requires type, message, location, and client_request_id. The location is the saved household location, not an unprompted device lookup. Identical retries reuse the same body and key; the backend returns the original report. A changed body with an old key is a conflict. The client validates the returned family, message, key, and received status. Sent means accepted by the service, not read or acknowledged by a human.

Master has no family-facing report-history or two-way chat API. Receipts are retained locally and support replies are unavailable. The app refreshes household/plan/alert/update data every 10 seconds while foregrounded and connected. The existing backend also supports plan-version long polling; it is not required by this integration.

The local development launcher in frontend/scripts wraps the unchanged backend with CORS handling for localhost browser clients. Source, lockfile, authentication rules, and allocation behavior in backend/ are preserved. Python 3.14 avoids runtime evaluation of APSW type-only annotations present in master. Use the isolated .runtime database and upstream seeding command for testing.
