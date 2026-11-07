# Haven REST API contract — Part 2: operations add-on

Part 1 (the original contract) stays as it is. This add-on adds what the government dashboard needs for logistics, communications and situational awareness. Nothing here changes an existing Part 1 response. Where this document extends a Part 1 endpoint, the new fields are optional and backwards-compatible.

Part 1 conventions still apply:
- base URL `/api`
- string IDs
- ISO 8601 UTC timestamps
- `latitude` / `longitude`
- nested-merge `PATCH`
- the shared `{"error": {"code", "message"}}` shape
- `Authorization: Bearer <token>`

**Permissions:** every endpoint in Part 2 is **operator-only** unless marked otherwise. Return `403` with code `not_permitted` for other roles. §10 adds a `partner` role for shelter and organization logins, and lists exactly what partners may do.

**Suggested build order:**
1. Organizations
2. Inventory
3. Needs
4. Shipments
5. Broadcast targeting
6. Conversations
7. Activity
8. Partner accounts and partner permissions (§10)

Both frontends already work against a mock of all of these:
- `frontend/src/api/mock.js` holds the logic.
- `frontend/mock-server/handler.js` serves it over HTTP, including auth and partner scoping.

Together they are a runnable reference for the side effects described below.

---

## 0. Shared shapes

### Site reference

Needs, shipments, inventory and conversations point at a place or party with a small reference object:

```json
{ "kind": "shelter", "id": "shelter_003" }
```

`kind` is one of `shelter`, `organization` or `family` (`family` is used only in conversations).

**In responses**, add a denormalized `name` so clients don't need a second lookup:

```json
{ "kind": "shelter", "id": "shelter_003", "name": "St. Luke Medical Annex" }
```

**In requests**, clients send only `kind` and `id`. The server ignores `name` if it is sent.

### Priority

`low`, `medium`, `high`, `critical`.

### Shelter status

Part 1 shows only `"open"`. The dashboard uses `open`, `full` and `closed`. Please accept all three.

---

## 1. Resource types

A fixed catalog of supplies that can be requested, stocked and shipped. Seed it in a migration.

### GET /resource-types

Any authenticated user.

```json
{
  "resource_types": [
    { "id": "water_bottled", "name": "Bottled water", "category": "water", "unit": "cases" },
    { "id": "food_mre", "name": "Ready-to-eat meals", "category": "food", "unit": "meals" },
    { "id": "insulin", "name": "Insulin (refrigerated)", "category": "medication", "unit": "vials" }
  ]
}
```

`category` is one of: `water`, `food`, `medication`, `medical_supplies`, `baby`, `bedding`, `hygiene`, `clothes`, `power`.

The categories `water`, `food`, `medication` and `clothes` line up with a shelter's `resources` keys from Part 1.

The seed catalog the dashboard expects is in `mock.js` (`RESOURCE_TYPES`).

---

## 2. Organizations

Relief organizations, third-party aid, depots and suppliers working a disaster.

### GET /organizations?disaster_id=disaster_001

```json
{
  "organizations": [
    {
      "id": "org_002",
      "disaster_id": "disaster_001",
      "name": "Bayside Food Bank",
      "type": "nonprofit",
      "services": ["distribution", "food"],
      "status": "active",
      "address": "55 Port Ave, Example City",
      "location": { "latitude": 27.94, "longitude": -82.43 },
      "contact": { "name": "Dana Ruiz", "phone": "+1-555-0102", "email": "ops@bayside.example" },
      "coverage_radius_km": 15,
      "notes": "Refrigerated truck available.",
      "updated_at": "2026-11-07T15:00:00Z"
    }
  ]
}
```

| Field | Values |
|---|---|
| `type` | `government`, `nonprofit`, `private`, `faith`, `medical` |
| `services` | any of `distribution`, `food`, `medical`, `transport`, `shelter_support`, `logistics` |
| `status` | `active`, `limited`, `inactive` |

### POST /organizations

The body is the organization object without `id` or `updated_at`. `disaster_id` is required.

Response: `201 Created` with the full object.

### GET /organizations/{organization_id}

Returns the organization object.

### PATCH /organizations/{organization_id}

Nested merge, same as shelters. Response: `200 OK` with the updated object.

---

## 3. Inventory

Countable stock held by an organization. A `holder` is a site reference. Only `organization` holders are needed now; the shape leaves room for shelters to hold stock later.

### GET /inventory?disaster_id=disaster_001

Optional filter: `&holder_kind=organization&holder_id=org_002`.

```json
{
  "items": [
    {
      "holder": { "kind": "organization", "id": "org_002", "name": "Bayside Food Bank" },
      "resource_type_id": "food_mre",
      "quantity": 600,
      "reserved": 100,
      "updated_at": "2026-11-07T15:00:00Z"
    }
  ]
}
```

`reserved` is stock committed to approved shipments that haven't left yet. The amount available to send is `quantity - reserved`.

### PATCH /organizations/{organization_id}/inventory

Sets absolute quantities, for example after a stock count. Items not listed stay unchanged.

```json
{
  "items": [
    { "resource_type_id": "food_mre", "quantity": 750 },
    { "resource_type_id": "water_bottled", "quantity": 0 }
  ]
}
```

Response: `200 OK` with `{"items": [...]}`, the holder's full inventory.

Return `409 inventory_conflict` if a new quantity would be below that row's `reserved`.

---

## 4. Needs

A request for a quantity of one resource type at a shelter or organization. Needs are the "who needs what" list. Operators log them; later, shelter and organization accounts could log their own.

### GET /needs?disaster_id=disaster_001

Optional filter: `&status=open`.

```json
{
  "needs": [
    {
      "id": "need_003",
      "disaster_id": "disaster_001",
      "requester": { "kind": "shelter", "id": "shelter_004", "name": "Northgate Church Hall" },
      "resource_type_id": "water_bottled",
      "quantity_needed": 40,
      "quantity_fulfilled": 0,
      "priority": "critical",
      "status": "open",
      "needed_by": "2026-11-07T18:00:00Z",
      "notes": "Over capacity, turning families away.",
      "created_at": "2026-11-07T14:20:00Z",
      "updated_at": "2026-11-07T14:20:00Z"
    }
  ]
}
```

**`status` values:**
- `open`
- `fulfilled`: the server sets this when `quantity_fulfilled >= quantity_needed`
- `cancelled`

The dashboard works out "in transit" amounts itself from linked shipments, so the server doesn't need to.

### POST /needs

Required: `disaster_id`, `requester`, `resource_type_id`, `quantity_needed` (> 0), `priority`.

Optional: `needed_by`, `notes`.

Response: `201 Created`.

### PATCH /needs/{need_id}

Operators may change these fields:
- `quantity_needed`
- `quantity_fulfilled` (to mark something received outside the system)
- `priority`
- `status` (`cancelled`, or `fulfilled` to close it manually)
- `needed_by`
- `notes`

Response: `200 OK`.

---

## 5. Shipments (dispatch)

A movement of resources from an organization's inventory to a shelter or another organization.

### GET /shipments?disaster_id=disaster_001

```json
{
  "shipments": [
    {
      "id": "shipment_002",
      "disaster_id": "disaster_001",
      "from": { "kind": "organization", "id": "org_002", "name": "Bayside Food Bank" },
      "to": { "kind": "shelter", "id": "shelter_003", "name": "St. Luke Medical Annex" },
      "items": [{ "resource_type_id": "food_mre", "quantity": 100 }],
      "need_ids": ["need_002"],
      "priority": "high",
      "status": "approved",
      "eta": "2026-11-07T16:00:00Z",
      "notes": "Use the Harbor Blvd loading dock.",
      "status_history": [{ "status": "approved", "at": "2026-11-07T15:10:00Z" }],
      "created_at": "2026-11-07T15:10:00Z",
      "updated_at": "2026-11-07T15:10:00Z"
    }
  ]
}
```

### POST /shipments

```json
{
  "disaster_id": "disaster_001",
  "from": { "kind": "organization", "id": "org_002" },
  "to": { "kind": "shelter", "id": "shelter_003" },
  "items": [{ "resource_type_id": "food_mre", "quantity": 100 }],
  "need_ids": ["need_002"],
  "priority": "high",
  "eta": "2026-11-07T16:00:00Z",
  "notes": "Use the Harbor Blvd loading dock."
}
```

**Status on creation:**
- Shipments created by an operator start as `approved`.
- Shipments that come in as offers (from organization accounts, later) start as `requested`.

On reaching `approved`, the server **reserves** each item at the source.

**Errors:**
- `409 insufficient_inventory` if any item's `quantity - reserved` at the source is too low.
- `400 invalid_request` if `from` and `to` are the same, or if `from` is not an organization.

Response: `201 Created`.

### PATCH /shipments/{shipment_id}

```json
{ "status": "in_transit" }
```

`eta` and `notes` can also be updated.

**Allowed status changes and their side effects** (do each change in one transaction):

| From | To | Side effect |
|---|---|---|
| `requested` | `approved` | Reserve items at the source (`409 insufficient_inventory` if short). |
| `requested` | `cancelled` | None. |
| `approved` | `in_transit` | Source: `quantity -= q` and `reserved -= q` for each item. |
| `approved` | `cancelled` | Release the reservation: `reserved -= q`. |
| `in_transit` | `delivered` | If `to` is an organization, add the items to its inventory. For each linked need with a matching `resource_type_id`, raise `quantity_fulfilled` (up to `quantity_needed`) and set `status: fulfilled` when it is met. |

Any other change: `409 invalid_transition`.

Append `{status, at}` to `status_history` on every change.

The server **does not** change a shelter's qualitative `resources` levels on delivery. Operators update those separately.

**Matching (no endpoint needed):** the dashboard ranks suggested sources for each need on the client. It scores each candidate by how much of the need its spare stock covers and how close it is. If ranking moves server-side later, add `GET /needs/{id}/suggestions`.

---

## 6. Broadcasts (targeted official updates)

This **extends Part 1 §5** (`/disasters/{id}/updates`). Part 1 clients keep working: an update with no `target` behaves exactly as before.

### POST /disasters/{disaster_id}/updates — new optional fields

```json
{
  "title": "Evacuation order: Zone A",
  "message": "Leave now. Go to Eastbay Fairgrounds. Bring medication and pet supplies.",
  "severity": "critical",
  "target": {
    "type": "radius",
    "center": { "latitude": 27.95, "longitude": -82.46 },
    "radius_km": 3,
    "label": "3 km around Central Community Center"
  },
  "audience": { "needs": ["immediate_medication", "no_car"] },
  "scheduled_for": null,
  "expires_at": "2026-11-08T03:00:00Z"
}
```

**`target`:**
- `{"type": "all"}` (the default when omitted), or
- `{"type": "radius", "center", "radius_km", "label"}`.

A family is in the target if its profile `location` is inside the circle. A polygon `type: "zone"` will come in a later add-on.

**`audience.needs`:** an empty array or missing field means every family in the target. Otherwise the family must match **any** of the listed flags:

| Flag | Matches when |
|---|---|
| `pets` | `needs.pets` |
| `immediate_medication` | `needs.immediate_medication` |
| `accessibility` | `needs.accessibility_notes` is non-empty |
| `no_car` | `resources.has_car == false` |
| `children` | `children > 0` |

**`scheduled_for`:** optional. Until that time the update is `scheduled` and families can't see it.

**`expires_at`:** optional. After that time the update is `expired` and drops out of family views.

**Response — `201 Created`:** the Part 1 update object plus these fields:

```json
{
  "target": { "type": "radius", "...": "..." },
  "audience": { "needs": ["immediate_medication", "no_car"] },
  "status": "published",
  "scheduled_for": null,
  "expires_at": "2026-11-08T03:00:00Z",
  "recipient_count": 212,
  "read_count": 0
}
```

`status` is one of `scheduled`, `published`, `retracted` or `expired`.

Work out `status` when reading, comparing against the current time, so no background job is needed.

`recipient_count` is fixed at publish time (or at `scheduled_for`).

### POST /disasters/{disaster_id}/updates/preview

Same body as the POST (`title` and `message` not required). Creates nothing.

```json
{ "recipient_count": 212 }
```

The composer calls this as the operator adjusts the target and audience.

### PATCH /updates/{update_id}

```json
{ "status": "retracted" }
```

Retracting removes the update from family views. Operators still see it, marked as retracted.

### GET /disasters/{disaster_id}/updates — visibility rules

- **Operators** see every update, with all the fields above.
- **Families** see only `published` updates whose target and audience include their family, in the Part 1 shape. Extra fields are fine for them to ignore.

### Read tracking

**`POST /updates/{update_id}/read`** (family role) records that the family opened the update. Return `204`.

`read_count` is the number of distinct families that opened it.

---

## 7. Conversations (direct messages)

One-to-one threads between operators (as a group) and a shelter, an organization or a family.

### GET /conversations?disaster_id=disaster_001

```json
{
  "conversations": [
    {
      "id": "conv_001",
      "disaster_id": "disaster_001",
      "participant": { "kind": "shelter", "id": "shelter_003", "name": "St. Luke Medical Annex" },
      "subject": "Food running low",
      "created_at": "2026-11-07T14:00:00Z",
      "last_message_at": "2026-11-07T15:02:00Z",
      "last_message_preview": "Thank you. Can they also bring water?",
      "unread_count": 1
    }
  ]
}
```

Sort by `last_message_at`, newest first.

`unread_count` counts messages from the participant that arrived after operators last marked the thread read. Read state is shared by all operators.

### POST /conversations

Starts a thread with its first message.

```json
{
  "disaster_id": "disaster_001",
  "participant": { "kind": "organization", "id": "org_005" },
  "subject": "Transport for wheelchair users",
  "message": "Can you send the accessible van to 2200 West Oak Ave?",
  "client_request_id": "0d0f5c1e-..."
}
```

Response: `201 Created` with the conversation object.

If a thread with the same participant and subject already exists, the server may return that thread instead of creating a new one.

### GET /conversations/{conversation_id}/messages

```json
{
  "messages": [
    {
      "id": "msg_001",
      "conversation_id": "conv_001",
      "sender": { "kind": "shelter", "id": "shelter_003", "name": "St. Luke Medical Annex" },
      "body": "We're down to one day of meals for 36 people.",
      "created_at": "2026-11-07T14:00:00Z"
    }
  ]
}
```

`sender.kind` is `operator` for messages sent from the dashboard.

Sort oldest first.

**Optional:** support `?after=<message_id>` so clients can fetch only newer messages.

### POST /conversations/{conversation_id}/messages

```json
{ "body": "Bayside is sending 100 meals, ETA 45 min.", "client_request_id": "..." }
```

Response: `201 Created` with the message.

`client_request_id` removes duplicates on retry, exactly as for reports in Part 1.

### POST /conversations/{conversation_id}/read

Marks the thread read for operators. Returns `204`.

### Family side

Families can call these endpoints for their own family only:
- `GET /conversations`
- `GET /conversations/{id}/messages`
- `POST /conversations/{id}/messages`

This lets the family app show operator replies to their reports.

Shelter and organization accounts will need new roles. That is out of scope for now; until then their replies can be entered by operators.

---

## 8. Activity feed

A combined, newest-first log of what happened in a disaster. It powers the Command Center timeline and will grow into an audit log.

### GET /disasters/{disaster_id}/activity?limit=50

```json
{
  "activity": [
    {
      "id": "act_041",
      "disaster_id": "disaster_001",
      "type": "shipment_status",
      "summary": "Shipment to Westside High School Gym marked in transit",
      "ref": { "kind": "shipment", "id": "shipment_001" },
      "actor": { "kind": "operator", "id": "user_001", "name": "government@demo.example" },
      "created_at": "2026-11-07T15:20:00Z"
    }
  ]
}
```

Write an entry whenever one of these happens:

| `type` | Written when |
|---|---|
| `shelter_created`, `shelter_updated` | shelter POST / PATCH |
| `update_published`, `update_retracted` | broadcasts |
| `need_created`, `need_updated` | needs |
| `shipment_created`, `shipment_status` | shipments |
| `org_created`, `org_updated`, `inventory_updated` | organizations |
| `message_received` | a non-operator posts in a conversation |
| `report_received` | a family files a report |

`ref.kind` can be `shelter`, `organization`, `need`, `shipment`, `update`, `conversation` or `report`. The dashboard uses it to link to the right page.

---

## 9. New error codes

| Status | Code | When |
|---|---|---|
| 404 | `organization_not_found`, `need_not_found`, `shipment_not_found`, `conversation_not_found`, `update_not_found` | unknown ID |
| 409 | `insufficient_inventory` | shipment creation or approval exceeds available stock |
| 409 | `inventory_conflict` | inventory set below reserved |
| 409 | `invalid_transition` | disallowed shipment status change |
| 403 | `not_permitted` | non-operator calls an operator endpoint, or a partner acts outside its own site |
| 403 | `account_disabled` | login attempt with a disabled partner account (requests with an existing token get `401`) |
| 409 | `email_in_use` | partner account email already belongs to a user |
| 400 | `invalid_credentials` | wrong current password on change-password |

---

## 10. Partner accounts and the partner portal

Shelters and relief organizations sign in to their own portal (the `3rdparty` branch) and manage their own data. Operators create these logins from the dashboard; there is **no public sign-up** for partners.

### Data model

- Add `'partner'` to the `users.role` check.
- Add a `must_change_password` flag to `users` (default false).
- New table:

```
partner_accounts
  user_id PK → users.id
  site_kind ('shelter' | 'organization')
  site_id
  contact_name
  status ('active' | 'disabled')
  created_by → users.id
  created_at
  last_login_at
```

One site can have several logins. Each login belongs to exactly one site.

### Login and /me for partners

`POST /auth/login` and `GET /me` are unchanged for operators and families. For a partner, `user` gains `site` and `must_change_password`:

```json
{
  "id": "user_7f3a",
  "role": "partner",
  "family_id": null,
  "email": "dispatch@medserve.example",
  "must_change_password": true,
  "site": { "kind": "organization", "id": "org_004", "name": "MedServe Mobile Clinic" }
}
```

- A disabled account gets `403 account_disabled` on login.
- Tokens that already exist for a disabled account get `401`.
- Update `last_login_at` on every successful login.

### POST /auth/change-password

Any signed-in user.

```json
{ "current_password": "harbor-cedar-4821", "new_password": "at-least-8-chars" }
```

- `204` on success. Clears `must_change_password`.
- `400 invalid_credentials` if the current password is wrong.
- `400 invalid_request` if the new password is under 8 characters.

The portal blocks every other screen until a partner with `must_change_password: true` has changed it.

### Operator endpoints for managing logins

**`GET /partner-accounts?disaster_id=disaster_001`** — logins for shelters and organizations in that disaster.

```json
{
  "accounts": [
    {
      "id": "user_7f3a",
      "email": "dispatch@medserve.example",
      "contact_name": "Dr. Lee Chen",
      "site": { "kind": "organization", "id": "org_004", "name": "MedServe Mobile Clinic" },
      "status": "active",
      "created_at": "2026-11-07T21:30:00Z",
      "last_login_at": "2026-11-07T21:34:00Z"
    }
  ]
}
```

**`POST /partner-accounts`**

```json
{ "site": { "kind": "organization", "id": "org_004" }, "email": "dispatch@medserve.example", "contact_name": "Dr. Lee Chen" }
```

Response — `201 Created`:

```json
{ "account": { "...": "as above" }, "temporary_password": "harbor-cedar-4821" }
```

- The server generates the temporary password with `secrets`, stores only its Argon2id hash, and sets `must_change_password: true`.
- The temporary password appears in **this response only**.
- `409 email_in_use` if any user already has that email.

**`PATCH /partner-accounts/{user_id}`**

```json
{ "status": "disabled" }
```

`contact_name` can also be changed. Disabling revokes all of that user's sessions immediately.

**`POST /partner-accounts/{user_id}/reset-password`**

```json
{ "temporary_password": "summit-river-1177" }
```

Revokes the user's sessions and sets `must_change_password: true`.

Write activity entries (§8) of type `partner_account_created` / `partner_account_updated` with `ref` pointing at the site.

### What partners may do

Everything is scoped to the partner's own site (`site.kind` + `site.id`). Anything not listed is `403 not_permitted`, including:
- reports, activity, families, plans and the alerts feed
- creating shelters or organizations
- broadcasts
- partner account management

| Endpoint | Partner access |
|---|---|
| `GET /disasters`, `/resource-types`, `/shelters`, `/organizations`, `/needs` | Read. Partners see open needs everywhere so they can offer help. |
| `PATCH /shelters/{id}` | Own shelter only. Fields: `status`, `capacity`, `resources`, `capabilities`. **Extends Part 1**, where shelter edits are operator-only. |
| `PATCH /organizations/{id}` | Own organization only. Fields: `status`, `contact`, `notes`, `services`, `address`, `location`, `coverage_radius_km`. |
| `GET /inventory` | Own holder rows only. |
| `PATCH /organizations/{id}/inventory` | Own organization only. |
| `POST /needs` | `requester` is forced to the partner's own site. |
| `PATCH /needs/{id}` | Own needs only. Fields: `quantity_needed`, `notes`, `needed_by`, `priority`. `status` may only be set to `cancelled`. |
| `GET /shipments` | Only shipments where `from` or `to` is the partner's site. |
| `POST /shipments` | Organization partners only, and `from` must be their own organization. Partner shipments are **offers** and are created with `status: "requested"`. Stock is checked (`409 insufficient_inventory`) but not reserved until an operator approves. |
| `PATCH /shipments/{id}` | The sender may move `approved → in_transit` ("departed"), withdraw its own offer (`requested → cancelled`), and edit `eta` / `notes`. The receiver may move `in_transit → delivered`. All other changes are `403`. |
| `GET /disasters/{id}/updates` | `published` updates only, in the operator shape. |
| `GET /conversations`, `POST /conversations` | Only threads whose `participant` is the partner's site. On create, `participant` is forced to their site. |
| `GET` / `POST /conversations/{id}/messages` | Own threads only. Partner messages have `sender: {kind: <site kind>, id: <site id>}`. |
| `POST /conversations/{id}/read` | Own threads. **Read state is per side.** Track operator and partner read times separately. `unread_count` counts the other side's messages since the caller's side last read the thread. |
| `/assistance-requests` (§11) | Approved organizations only. Redacted view of open, consented, in-range requests; full view of the ones they accepted; accept, update and release as described in §11. |

Partner writes appear in the activity feed with `actor: {kind: <site kind>, id, name}`, so operators can see who changed what.

---

## 11. Citizen assistance (households who can't reach aid)

Some households can't get to a shelter or distribution point: flooded streets, no car, a wheelchair user, someone on home oxygen. Citizen assistance lets them ask for help where they are, and lets **approved partner organizations** respond directly while government keeps oversight.

### Privacy rules (the backend must enforce these, not just the UI)

Household locations and care needs are sensitive. People in disasters are targeted by scams and worse. Part 1 says family data is visible only to the family and operators. This section opens a narrow, consented exception:

1. **Consent.** Partners only ever see requests where the household set `consent_to_share: true`. Without consent, only operators can see or act on a request.
2. **Approved organizations only.** Only organizations with `citizen_assistance: true` (set by an operator) see any citizen requests. Shelters don't.
3. **Coverage.** A partner only sees open requests within its organization's `coverage_radius_km`.
4. **Approximate until accepted.** Before accepting, partners get a **redacted** view: rounded location (2 decimal places, about 1 km), distance, request type, items, priority and household *flags*. Name, phone, address, exact location, the free-text message and care notes are **withheld** until the partner accepts the request.
5. **Logged reveals.** Accepting writes an activity entry (`citizen_request_claimed`) saying that contact details were released, and to whom.
6. **Release on exit.** If a partner releases a request, it loses access to the full details.

Retention: delete or anonymize a request's contact and care details a set period after it closes (for example 30 days). Agree the period with whoever owns the data.

### Organization flag

Organizations gain `citizen_assistance` (boolean, default false). **Only operators** may change it. Partner `PATCH /organizations/{id}` must ignore it.

### Request shape (operator view)

```json
{
  "id": "assist_002",
  "disaster_id": "disaster_001",
  "family_id": "family_014",
  "source_report_id": "report_004",
  "kind": "medical",
  "priority": "critical",
  "status": "open",
  "message": "Elderly parent on oxygen, power is out. Need transport.",
  "items": [{ "resource_type_id": "oxygen", "quantity": 1 }],
  "cannot_travel": true,
  "location": { "latitude": 27.942, "longitude": -82.49 },
  "address": "4120 Cypress Ave, Example City",
  "contact": { "name": "Linh Nguyen", "phone": "+1-555-0142" },
  "household": {
    "adults": 2, "children": 0, "pets": false, "immediate_medication": true,
    "medical_notes": "COPD, on home oxygen 24/7.", "accessibility_notes": null,
    "other_special_care": null, "has_car": false
  },
  "consent_to_share": true,
  "assigned_to": null,
  "eta": null,
  "partner_note": null,
  "resolution_note": null,
  "operator_notes": "",
  "history": [{ "status": "open", "at": "2026-11-07T15:20:00Z", "by": { "kind": "family", "id": "family_014", "name": "Household" } }],
  "created_at": "2026-11-07T15:20:00Z",
  "updated_at": "2026-11-07T15:20:00Z"
}
```

| Field | Values |
|---|---|
| `kind` | `delivery`, `transport`, `medical`, `welfare_check`, `other` |
| `status` | `open`, `claimed` (accepted), `en_route`, `completed`, `cancelled` |
| `priority` | as in §0 |

- **`household`** is a snapshot of the family profile (Part 1 §2) at request time. Pre-fill it from the profile so the family doesn't retype it.
- **`partner_note`** and **`eta`** are what the responding organization tells the household. The family app should show them.
- **`operator_notes`** are never shown to partners or families.

### Family side (for the family app)

**`POST /families/{family_id}/assistance-requests`** (owning family). Idempotent on `client_request_id`, like reports.

```json
{
  "kind": "delivery",
  "message": "Street is flooded and we can't drive out.",
  "items": [{ "resource_type_id": "water_bottled", "quantity": 2 }],
  "location": { "latitude": 27.95, "longitude": -82.46 },
  "address": "123 Palmetto St, Example City",
  "contact_phone": "+1-555-0100",
  "consent_to_share": true,
  "client_request_id": "2c1f..."
}
```

- The server copies the household snapshot from the family profile.
- It sets `priority` from simple rules: `critical` when `kind` is `medical` and `immediate_medication` is true; `high` for `transport`, or when there are children or accessibility needs; `medium` otherwise. Operators can override it.
- The consent prompt should be explicit, for example: *"Share my request, address and phone with approved aid organizations so they can help me directly."*

**`GET /families/{family_id}/assistance-requests`** lists the family's own requests. Include `status`, `eta`, `partner_note`, and `assigned_to.name` (the organization helping them). It never includes `operator_notes`.

**`PATCH /families/{family_id}/assistance-requests/{id}`** with `{"status": "cancelled"}` lets the family cancel ("we got help").

### Operator endpoints

**`GET /assistance-requests?disaster_id=…`** returns every request with full details, as `{"requests": [...]}`.

**`PATCH /assistance-requests/{id}`**:
- `assigned_to: {kind: "organization", id}` assigns the request and moves `open → claimed`. Returns `409 consent_required` if `consent_to_share` is false.
- `assigned_to: null` unassigns it and moves `claimed`/`en_route → open`.
- `status` can be any value (close, cancel, reopen).
- `priority`, `operator_notes`, `eta` and `partner_note` can be changed.

### Partner endpoints

**`GET /assistance-requests?disaster_id=…`** returns two kinds of entries. Shelters and unapproved organizations get `{"requests": []}`.

1. **Requests assigned to this partner's organization:** the full shape plus `redacted: false` and `distance_km`.
2. **Open, consented requests within coverage:** the redacted shape.

```json
{
  "id": "assist_011", "disaster_id": "disaster_001", "kind": "delivery", "priority": "high", "status": "open",
  "redacted": true,
  "items": [{ "resource_type_id": "food_canned", "quantity": 1 }],
  "cannot_travel": true,
  "approx_location": { "latitude": 27.96, "longitude": -82.47 },
  "distance_km": 2.5,
  "household": { "people": 2, "children": 0, "pets": false, "immediate_medication": false, "accessibility": true, "has_car": false },
  "created_at": "…", "updated_at": "…"
}
```

**`POST /assistance-requests/{id}/claim`**

```json
{ "eta": "2026-11-07T16:00:00Z", "partner_note": "We're bringing your supplies." }
```

Returns `200` with the full request.

| Error | When |
|---|---|
| `409 already_claimed` | Someone else accepted it first. Do this check atomically: compare-and-set on `status = 'open' AND assigned_to IS NULL`. |
| `403 not_permitted` | The organization isn't approved. |
| `404` | No consent, or outside the organization's coverage. Don't reveal that the request exists. |

**`PATCH /assistance-requests/{id}`** is for the assigned organization only (`404` otherwise).

| Change | Effect |
|---|---|
| `{"status": "en_route", "eta"?, "partner_note"?}` | From `claimed`. |
| `{"status": "completed", "resolution_note", "deduct_inventory"?}` | From `claimed` or `en_route`. `deduct_inventory: true` subtracts the request's `items` from the organization's inventory, never below `reserved`. |
| `{"status": "released", "note"}` | Gives the request up. It returns to `status: open`, `assigned_to: null`, and the household's `eta`/`partner_note` are cleared. `released` is recorded in `history` but is not a stored status. |

The response is the updated request, or `{id, status, released: true}` after a release.

### Activity types

`citizen_request_claimed`, `citizen_request_status`, `citizen_request_released` with `ref: {kind: "assistance", id}`.

### Error codes

`409 already_claimed`, `409 consent_required`, `404 request_not_found`.
