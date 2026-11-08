# Hurricane evacuation demo

Haven is now a hurricane evacuation app. This document is the add-on contract for the live demo:
a hurricane status (peace or active), an "Initiate hurricane" control, an evacuation preview that
compares Haven's personalized allocation with the old nearest-shelter approach, and the household
app's reaction. It extends the existing API; no existing endpoint changes shape.

## Demo flow

1. **Peace.** The government dashboard is all green: "All clear — no active hurricane." Shelters are
   on standby, households are registered, and Haven keeps their personalized plans pre-computed.
   The household app shows the household's plan and the needs Haven has on file.
2. **Preview evacuation.** The operator opens the preview. Every household animates from home to its
   destination (a simulation, straight-line paths). A toggle switches between **Nearest shelter**
   and **Haven personalized**. Side-by-side metrics show unmet needs (medication, medical staff,
   wheelchair access, pets, special care), people over capacity, overcrowded and idle shelters,
   utilization and travel. Clicking a need highlights the affected households.
3. **Initiate hurricane.** One click: the status becomes active, a critical evacuation broadcast goes to
   all households, and the personalized assignments are published. The dashboard turns to operations
   mode. The household app shows the evacuation broadcast as its latest official instruction, above
   the household's shelter, on its next refresh (every 30 seconds).
4. **Stop disaster.** Returns to peace and removes the demo run's broadcast and activity, so the demo
   can be rehearsed again. Household profiles and shelters are kept.

The comparison reports measured trade-offs. Personalized allocation can increase travel while
removing unmet needs and overcrowding. Supply labels are availability signals, not inventory; the
demo never invents quantities or costs.

## API add-on

All paths are under `/api`. Errors use the existing `{"error": {"code", "message"}}` envelope.
`404 disaster_not_found` applies to every path below.

### Hurricane status

Stored in table `hurricane_status` (migration 4). A disaster with no row is in `peace`.

```
HurricaneStatus = {
  "disaster_id": str,
  "phase": "peace" | "active",
  "hurricane": {"name": str, "category": int} | null,   # null in peace
  "started_at": str | null,                             # ISO timestamp; null in peace
  "updated_at": str | null                              # null if never initiated
}
```

| Method and path | Auth | Result |
| --- | --- | --- |
| `GET /disasters/{disaster_id}/hurricane` | Public | `200 HurricaneStatus` |
| `POST /disasters/{disaster_id}/hurricane/initiate` | Operator | `200 HurricaneStatus` (active) |
| `POST /disasters/{disaster_id}/hurricane/reset` | Operator | `200 HurricaneStatus` (peace) |

**Initiate** body (all optional): `{"name": str (1–60 chars, default "Hurricane Delia"), "category": int 1–5 (default 4)}`.
`409 hurricane_already_active` if already active. In one transaction it:

1. stores the active status with name, category and `started_at`;
2. publishes a critical broadcast to all households — title `"{name} evacuation order"`, message
   `"Category {category} hurricane. Mandatory evacuation for {affected_area}. Open Haven for your
   personalized shelter assignment and follow instructions from local officials."` — and records its
   `update_published` activity exactly as `POST /disasters/{id}/updates` does;
3. records activity `hurricane_initiated` (ref kind `disaster`, ref id the disaster id), summary
   `"{name} (Category {category}) initiated: personalized assignments published to {n} households"`.

Assignments are not recomputed here: `current_assignments` is already kept current by every
family/shelter change and at startup, so publishing is instant.

**Reset** is idempotent. It deletes the status row, the broadcast created by initiate (and its
`broadcast_targets` row and activity entries), and the disaster's `hurricane_initiated` activity.

### Evacuation preview (nearest shelter vs. personalized)

`GET /disasters/{disaster_id}/evacuation/preview` — operator only, read-only, works in either phase.
`personalized` is the stored assignment (`current_assignments`), i.e. exactly what initiate publishes.
`naive` is computed on the fly: each household goes to the geographically closest shelter whose
status is `open` or `full` (ties by shelter id), ignoring needs, capacity and supplies.

```
EvacuationPreview = {
  "disaster_id": str,
  "generated_at": str,
  "households": [{
    "family_id": str,
    "location": {"latitude": float, "longitude": float},
    "people": int,
    "has_car": bool,
    "requirements": [Requirement],        # this household's needs, in REQUIREMENTS order
    "naive": Destination,
    "personalized": Destination
  }],
  "naive": EvacuationMetrics,
  "personalized": EvacuationMetrics
}
Destination = {"shelter_id": str | null, "distance_km": float | null, "unmet": [Requirement]}
Requirement = "medication" | "medical_staff" | "wheelchair_accessible" | "pets" | "child_friendly" | "special_care"
EvacuationMetrics = {
  "households": int,
  "people": int,
  "unassigned_households": int,
  "households_with_needs": int,          # households with at least one requirement
  "unmet_households": int,               # households whose destination lacks at least one requirement
  "needs": [{"requirement": Requirement, "households": int, "unmet_households": int}],  # all six, REQUIREMENTS order
  "people_over_capacity": int,           # sum over shelters of max(0, people - total_people)
  "overcrowded_shelters": int,           # shelters with people > total_people
  "idle_shelters": int,                  # open shelters with total_people > 0 and nobody assigned
  "max_utilization": float | null,       # people / total_people over open shelters with total_people > 0
  "min_utilization": float | null,
  "travel": {"mean_km": float | null, "p95_km": float | null, "max_km": float | null,
             "total_km": float, "no_car_mean_km": float | null},
  "shelters": [{"shelter_id": str, "name": str, "people": int, "total_people": int,
                "utilization": float | null, "people_over_capacity": int, "unmet_households": int}]
}
```

`REQUIREMENTS` order is `medication, medical_staff, wheelchair_accessible, pets, child_friendly,
special_care`. A household's requirements and a destination's unmet list use the same rules as the
allocator's `compatibility_mismatches` (medication means an immediate-medication need at a shelter
whose medication label is not `available` or `limited`).

### Offline comparison script

```sh
cd backend
just compare-naive                                   # synthetic fixture, fresh personalized solve
just compare-naive --database disaster_response.sqlite3   # stored assignments, read-only
just compare-naive --json comparison.json            # also write the full comparison
```

## Running the demo

```sh
cd backend
just demo-data                                 # rebuilds the disposable demo database
just dev                                       # API on http://127.0.0.1:8000
cd ../frontend && npm run dev                  # dashboard on http://localhost:5173
cd ../app && npm start                         # household app on http://localhost:8081 (press w)
```

Sign in to the dashboard as `gov@gov.com` (password `gov`) and to the household app as
`family@family.com` (password `family`). Then: show the green peace dashboard and the household's plan on the phone →
**Preview evacuation**, play "Nearest shelter" and point at the red households and the
over-capacity shelters → switch to "Haven personalized" → **Initiate hurricane** (the phone shows the
evacuation order within 30 seconds) → **Stop disaster** to rehearse again. Keep the
dashboard tab in front while the animation plays; browsers pause animation in background tabs.

The initiate broadcast is stored with an explicit `{"type": "all"}` target so reset can find and
remove it; families see it like any broadcast to all households.

## Demo household

`just demo-data` also gives `family@family.com` a household profile: 2 adults, 1 child, a pet,
immediate medication (insulin), a wheelchair-accessible entrance need and no car, placed where the
nearest shelter has no medical staff or medication. Nearest-shelter routing would fail them; Haven's
plan sends them to a shelter that supports every need.
