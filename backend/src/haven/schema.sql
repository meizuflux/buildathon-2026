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
-- Supply logistics (API contract part 2), shared with citizen donations.
-- Fixed catalog of supplies. citizen_requestable = 0 keeps clinical items out of citizen requests
-- and pledges.
CREATE TABLE IF NOT EXISTS resource_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('water', 'food', 'medication', 'medical_supplies',
        'baby', 'bedding', 'hygiene', 'clothes', 'power')),
    unit TEXT NOT NULL,
    citizen_requestable INTEGER NOT NULL CHECK (citizen_requestable IN (0, 1)),
    sort_order INTEGER NOT NULL
);
INSERT OR IGNORE INTO resource_types VALUES
    ('water_bottled', 'Bottled water', 'water', 'cases', 1, 1),
    ('water_gallon', 'Water jugs (1 gal)', 'water', 'jugs', 1, 2),
    ('food_mre', 'Ready-to-eat meals', 'food', 'meals', 1, 3),
    ('food_canned', 'Canned food', 'food', 'cases', 1, 4),
    ('baby_formula', 'Baby formula', 'baby', 'cans', 1, 5),
    ('diapers', 'Diapers', 'baby', 'packs', 1, 6),
    ('insulin', 'Insulin (refrigerated)', 'medication', 'vials', 0, 7),
    ('rx_refills', 'Prescription refills', 'medication', 'doses', 0, 8),
    ('first_aid', 'First aid kits', 'medical_supplies', 'kits', 1, 9),
    ('oxygen', 'Oxygen cylinders', 'medical_supplies', 'cylinders', 0, 10),
    ('blankets', 'Blankets', 'bedding', 'units', 1, 11),
    ('cots', 'Cots', 'bedding', 'units', 1, 12),
    ('hygiene_kit', 'Hygiene kits', 'hygiene', 'kits', 1, 13),
    ('clothing', 'Clothing bundles', 'clothes', 'bundles', 1, 14),
    ('generator', 'Generators', 'power', 'units', 1, 15),
    ('fuel', 'Fuel', 'power', 'gallons', 1, 16);
-- Relief organizations, depots, and suppliers. An organization with a site_type is also a public
-- donation hub that citizens can find, pledge drop-offs to, and collect supplies from.
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    disaster_id TEXT NOT NULL REFERENCES disasters(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('government', 'nonprofit', 'private', 'faith', 'medical')),
    services_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'limited', 'inactive')),
    address TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    contact_json TEXT NOT NULL,
    coverage_radius_km REAL CHECK (coverage_radius_km >= 0),
    notes TEXT NOT NULL DEFAULT '',
    site_type TEXT CHECK (site_type IN ('mosque', 'church', 'fire_station', 'school',
        'community_center', 'other')),
    capacity_pct INTEGER NOT NULL DEFAULT 0 CHECK (capacity_pct BETWEEN 0 AND 100),
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS organizations_disaster_idx ON organizations(disaster_id);
-- Countable stock. reserved = units promised to approved shipments and claimed citizen requests.
-- target = the stock level a hub wants to hold, which drives the needs citizens see.
CREATE TABLE IF NOT EXISTS inventory (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    resource_type_id TEXT NOT NULL REFERENCES resource_types(id),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= quantity),
    target INTEGER NOT NULL DEFAULT 0 CHECK (target >= 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (organization_id, resource_type_id)
);
-- Who needs what: a quantity of one resource type at a shelter or organization.
CREATE TABLE IF NOT EXISTS needs (
    id TEXT PRIMARY KEY,
    disaster_id TEXT NOT NULL REFERENCES disasters(id),
    requester_kind TEXT NOT NULL CHECK (requester_kind IN ('shelter', 'organization')),
    requester_id TEXT NOT NULL,
    resource_type_id TEXT NOT NULL REFERENCES resource_types(id),
    quantity_needed INTEGER NOT NULL CHECK (quantity_needed > 0),
    quantity_fulfilled INTEGER NOT NULL DEFAULT 0 CHECK (quantity_fulfilled >= 0),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL CHECK (status IN ('open', 'fulfilled', 'cancelled')),
    needed_by TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS needs_disaster_idx ON needs(disaster_id, status);
-- Stock moving from an organization to a shelter or another organization.
-- items_json: [{"resource_type_id", "quantity"}]; status_history_json: [{"status", "at"}]
CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    disaster_id TEXT NOT NULL REFERENCES disasters(id),
    from_organization_id TEXT NOT NULL REFERENCES organizations(id),
    to_kind TEXT NOT NULL CHECK (to_kind IN ('shelter', 'organization')),
    to_id TEXT NOT NULL,
    items_json TEXT NOT NULL,
    need_ids_json TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'in_transit', 'delivered',
        'cancelled')),
    eta TEXT,
    notes TEXT NOT NULL DEFAULT '',
    status_history_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shipments_disaster_idx ON shipments(disaster_id);
-- Transport sent to clear space at a full hub.
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
-- Citizen requests for goods. An operator claims one, picks a source hub and delivery method, and
-- fulfills it; claiming reserves the items at the hub. items_json: [{"resource_type_id", "quantity"}]
CREATE TABLE IF NOT EXISTS supply_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    items_json TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'fulfilled', 'cancelled')),
    hub_id TEXT REFERENCES organizations(id),
    method TEXT CHECK (method IN ('delivery', 'pickup')),
    assigned_to TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supply_requests_status_idx ON supply_requests(status, created_at);
CREATE INDEX IF NOT EXISTS supply_requests_user_idx ON supply_requests(user_id);
-- Citizen pledges to drop goods off at a hub; staff confirm receipt, which adds the items to stock.
CREATE TABLE IF NOT EXISTS pledges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    hub_id TEXT NOT NULL REFERENCES organizations(id),
    items_json TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('pending', 'received', 'no_show', 'cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pledges_hub_idx ON pledges(hub_id, status);
CREATE INDEX IF NOT EXISTS pledges_user_idx ON pledges(user_id);
