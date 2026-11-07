-- Initial schema; this scaffold creates missing tables but does not migrate them.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('family', 'operator')),
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
