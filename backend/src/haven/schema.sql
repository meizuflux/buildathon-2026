-- Initial schema; this scaffold creates missing tables but does not migrate them.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('family', 'operator', 'hub_staff')),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS disasters (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    affected_area TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
    disaster_id TEXT NOT NULL REFERENCES disasters(id),
    adults INTEGER NOT NULL CHECK (adults >= 0),
    children INTEGER NOT NULL CHECK (children >= 0),
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    needs_json TEXT NOT NULL,
    resources_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shelters (
    id TEXT PRIMARY KEY,
    disaster_id TEXT NOT NULL REFERENCES disasters(id),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    status TEXT NOT NULL,
    capacity_json TEXT NOT NULL,
    capabilities_json TEXT NOT NULL,
    resources_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id),
    version INTEGER NOT NULL,
    plan_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (family_id, version)
);
-- Operator-set allocation budget is distinct from the derived free capacity
-- returned in shelters.capacity_json.available_people. It may exceed physical
-- capacity when forced assignments need to preserve a destination.
CREATE TABLE IF NOT EXISTS shelter_capacity_budgets (
    shelter_id TEXT PRIMARY KEY REFERENCES shelters(id) ON DELETE CASCADE,
    allocation_budget INTEGER NOT NULL CHECK (allocation_budget >= 0)
);
-- The current authoritative reservation for each family. Historical plan
-- versions remain in plans; this table is replaced atomically per disaster.
CREATE TABLE IF NOT EXISTS current_assignments (
    family_id TEXT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
    disaster_id TEXT NOT NULL REFERENCES disasters(id) ON DELETE CASCADE,
    shelter_id TEXT REFERENCES shelters(id) ON DELETE SET NULL,
    people INTEGER NOT NULL CHECK (people >= 0),
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS current_assignments_disaster_idx ON current_assignments(disaster_id);
CREATE INDEX IF NOT EXISTS current_assignments_shelter_idx ON current_assignments(shelter_id);
CREATE TABLE IF NOT EXISTS disaster_updates (
    id TEXT PRIMARY KEY,
    disaster_id TEXT NOT NULL REFERENCES disasters(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL,
    published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    latitude REAL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL CHECK (longitude BETWEEN -180 AND 180),
    client_request_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (family_id, client_request_id)
);
-- Shared across workers; expired counters are cleared on login.
CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    window_start TEXT NOT NULL,
    attempts INTEGER NOT NULL CHECK (attempts >= 0)
);

CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    disaster_id TEXT NOT NULL REFERENCES disasters(id),
    type TEXT NOT NULL,
    summary TEXT NOT NULL,
    ref_kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_disaster_created_idx
    ON activity(disaster_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS broadcast_targets (
    update_id TEXT PRIMARY KEY REFERENCES disaster_updates(id) ON DELETE CASCADE,
    target_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, disaster_id TEXT NOT NULL REFERENCES disasters(id), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS organizations_disaster_idx ON organizations(disaster_id);
CREATE TABLE IF NOT EXISTS resource_types (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL);
INSERT OR IGNORE INTO resource_types VALUES
 ('water_bottled','Bottled water','water','cases'),
 ('food_mre','Ready-to-eat meals','food','meals'),
 ('food_canned','Canned food','food','cases'),
 ('insulin','Insulin (refrigerated)','medication','vials'),
 ('oxygen','Oxygen','medical_supplies','units'),
 ('medical_supplies','Medical supplies','medical_supplies','kits'),
 ('baby_supplies','Baby supplies','baby','kits'),
 ('bedding','Bedding','bedding','sets'),
 ('hygiene','Hygiene supplies','hygiene','kits'),
 ('clothes','Clothes','clothes','sets'),
 ('power','Power supplies','power','units');
CREATE TABLE IF NOT EXISTS inventory (organization_id TEXT NOT NULL REFERENCES organizations(id), resource_type_id TEXT NOT NULL REFERENCES resource_types(id), quantity INTEGER NOT NULL CHECK(quantity >= 0), reserved INTEGER NOT NULL CHECK(reserved >= 0 AND reserved <= quantity), updated_at TEXT NOT NULL, PRIMARY KEY(organization_id, resource_type_id));
CREATE TABLE IF NOT EXISTS needs (id TEXT PRIMARY KEY, disaster_id TEXT NOT NULL REFERENCES disasters(id), requester_kind TEXT NOT NULL, requester_id TEXT NOT NULL, resource_type_id TEXT NOT NULL REFERENCES resource_types(id), quantity_needed INTEGER NOT NULL, quantity_fulfilled INTEGER NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, needed_by TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS needs_disaster_idx ON needs(disaster_id);
CREATE TABLE IF NOT EXISTS shipments (id TEXT PRIMARY KEY, disaster_id TEXT NOT NULL REFERENCES disasters(id), source_id TEXT NOT NULL REFERENCES organizations(id), destination_kind TEXT NOT NULL, destination_id TEXT NOT NULL, items TEXT NOT NULL, need_ids TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, eta TEXT, notes TEXT, status_history TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS shipments_disaster_idx ON shipments(disaster_id);

-- Citizen donations, built on the logistics tables above (organizations, inventory,
-- resource_types). Keep in sync with migration 3 in migrations.py.

-- Citizen-facing catalog details. Specific items citizens donate and request, alongside the broad
-- operational types above. citizen_requestable = 0 keeps clinical and broad operational items out
-- of the citizen app.
INSERT OR IGNORE INTO resource_types VALUES
 ('water_gallon','Water jugs (1 gal)','water','jugs'),
 ('baby_formula','Baby formula','baby','cans'),
 ('diapers','Diapers','baby','packs'),
 ('rx_refills','Prescription refills','medication','doses'),
 ('first_aid','First aid kits','medical_supplies','kits'),
 ('blankets','Blankets','bedding','units'),
 ('cots','Cots','bedding','units'),
 ('hygiene_kit','Hygiene kits','hygiene','kits'),
 ('clothing','Clothing bundles','clothes','bundles'),
 ('generator','Generators','power','units'),
 ('fuel','Fuel','power','gallons');
CREATE TABLE IF NOT EXISTS resource_type_details (
    resource_type_id TEXT PRIMARY KEY REFERENCES resource_types(id),
    citizen_requestable INTEGER NOT NULL CHECK (citizen_requestable IN (0, 1)),
    sort_order INTEGER NOT NULL
);
INSERT OR IGNORE INTO resource_type_details VALUES
 ('water_bottled', 1, 1), ('water_gallon', 1, 2), ('food_mre', 1, 3), ('food_canned', 1, 4),
 ('baby_formula', 1, 5), ('diapers', 1, 6), ('first_aid', 1, 7), ('blankets', 1, 8),
 ('cots', 1, 9), ('hygiene_kit', 1, 10), ('clothing', 1, 11), ('generator', 1, 12),
 ('fuel', 1, 13), ('insulin', 0, 14), ('rx_refills', 0, 15), ('oxygen', 0, 16),
 ('medical_supplies', 0, 17), ('baby_supplies', 0, 18), ('bedding', 0, 19), ('hygiene', 0, 20),
 ('clothes', 0, 21), ('power', 0, 22);

-- Organizations that are also public donation hubs citizens can be matched to.
-- When storage_units is set, % full is derived from stock (see hub_view); otherwise capacity_pct.
CREATE TABLE IF NOT EXISTS hubs (
    organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    site_type TEXT NOT NULL CHECK (site_type IN ('mosque', 'church', 'fire_station', 'school',
        'community_center', 'other')),
    storage_units INTEGER CHECK (storage_units > 0),
    capacity_pct INTEGER NOT NULL DEFAULT 0 CHECK (capacity_pct BETWEEN 0 AND 100)
);
-- Hub fields read from the organization record, with % full computed from current stock so it
-- stays correct whichever code path moved the stock.
CREATE VIEW IF NOT EXISTS hub_view AS
SELECT
    o.id AS id,
    o.disaster_id AS disaster_id,
    json_extract(o.data, '$.name') AS name,
    h.site_type AS site_type,
    COALESCE(json_extract(o.data, '$.status'), 'active') AS status,
    json_extract(o.data, '$.address') AS address,
    json_extract(o.data, '$.location.latitude') AS latitude,
    json_extract(o.data, '$.location.longitude') AS longitude,
    CASE WHEN h.storage_units IS NULL THEN h.capacity_pct
        ELSE MIN(100, CAST(ROUND(100.0 * (
            SELECT COALESCE(SUM(i.quantity), 0) FROM inventory i WHERE i.organization_id = o.id
        ) / h.storage_units) AS INTEGER)) END AS capacity_pct,
    h.storage_units AS storage_units,
    o.updated_at AS updated_at
FROM organizations o JOIN hubs h ON h.organization_id = o.id;

-- Transport sent to clear a full hub; completing it moves the hub's surplus to the nearest depot.
CREATE TABLE IF NOT EXISTS pickup_requests (
    id TEXT PRIMARY KEY,
    hub_id TEXT NOT NULL REFERENCES organizations(id),
    requested_by TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK (status IN ('dispatched', 'completed', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pickup_requests_hub_idx ON pickup_requests(hub_id, status);
-- Hub staff accounts manage exactly one hub.
CREATE TABLE IF NOT EXISTS hub_staff (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    hub_id TEXT NOT NULL REFERENCES organizations(id)
);
-- Citizen requests for goods. The matcher assigns the best source hub and reserves the items
-- (open -> matched); an operator then claims it, chooses delivery or pickup, and fulfills it.
-- items_json: [{"resource_type_id", "quantity"}]; match_json: {"distance_km", "score", "reasons"}
CREATE TABLE IF NOT EXISTS supply_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    items_json TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('open', 'matched', 'assigned', 'fulfilled',
        'cancelled')),
    hub_id TEXT REFERENCES organizations(id),
    match_json TEXT,
    method TEXT CHECK (method IN ('delivery', 'pickup')),
    assigned_to TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supply_requests_status_idx ON supply_requests(status, created_at);
CREATE INDEX IF NOT EXISTS supply_requests_user_idx ON supply_requests(user_id);
-- Citizen pledges to drop goods off at the hub the matcher picked; staff confirm receipt.
CREATE TABLE IF NOT EXISTS pledges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    hub_id TEXT NOT NULL REFERENCES organizations(id),
    items_json TEXT NOT NULL,
    match_json TEXT,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('pending', 'received', 'no_show', 'cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pledges_hub_idx ON pledges(hub_id, status);
CREATE INDEX IF NOT EXISTS pledges_user_idx ON pledges(user_id);
-- Custom items outside the catalog (e.g. a wheelchair), reviewed by a government worker.
CREATE TABLE IF NOT EXISTS custom_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('donation', 'request')),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'completed',
        'cancelled')),
    hub_id TEXT REFERENCES organizations(id),
    response TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS custom_submissions_status_idx ON custom_submissions(status, created_at);
CREATE INDEX IF NOT EXISTS custom_submissions_user_idx ON custom_submissions(user_id);
