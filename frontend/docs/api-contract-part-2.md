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

**Permissions:** every endpoint in Part 2 is **operator-only** unless marked otherwise. Return `403` with code `not_permitted` for other roles.

**Suggested build order:**
1. Organizations
2. Inventory
3. Needs
4. Shipments
5. Broadcast targeting
6. Conversations
7. Activity

The dashboard already works against an in-browser mock of all of these (`frontend/src/api/mock.js`). That file is a runnable reference for the side effects described below.

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
| 403 | `not_permitted` | non-operator calls an operator endpoint |
