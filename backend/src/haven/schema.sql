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
-- Donation hubs: community drop-off/pick-up points and their inventory.
CREATE TABLE IF NOT EXISTS hubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('church', 'fire_station', 'school', 'community_center', 'other')),
    address TEXT NOT NULL,
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    capacity_pct INTEGER NOT NULL CHECK (capacity_pct BETWEEN 0 AND 100),
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hub_supplies (
    hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('water', 'diapers', 'formula', 'canned_goods', 'blankets')),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    target INTEGER NOT NULL CHECK (target >= 0),
    PRIMARY KEY (hub_id, category)
);
CREATE TABLE IF NOT EXISTS pickup_requests (
    id TEXT PRIMARY KEY,
    hub_id TEXT NOT NULL REFERENCES hubs(id),
    requested_by TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK (status IN ('dispatched', 'completed', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pickup_requests_hub_idx ON pickup_requests(hub_id, status);
