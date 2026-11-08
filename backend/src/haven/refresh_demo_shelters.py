"""Update the demo shelter network without recreating accounts or households.

Preview: python -m haven.refresh_demo_shelters
Apply:   python -m haven.refresh_demo_shelters --apply
A consistent SQLite backup is saved before any edit. Only curated demo shelter
IDs in the demo disaster are changed; household/report/history records survive.
"""

import argparse
import asyncio
import json
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import apsw

from haven.allocation import recompute_disasters
from haven.auth import now, timestamp
from haven.db import connect, database_path
from haven.demo_data import DEMO_DISASTER_ID, DEMO_LOCATIONS, demo_shelter_snapshots


async def replace_demo_shelters(connection: apsw.AsyncConnection) -> dict[str, int]:
    """Caller owns an immediate transaction; preserve non-demo shelter rows."""
    row = await (
        await connection.execute("SELECT name FROM disasters WHERE id=?", (DEMO_DISASTER_ID,))
    ).fetchone()
    if row is None or ("Golden Gate" not in str(row[0]) and not str(row[0]).startswith("Demo")):
        raise ValueError(
            "The selected database does not contain the expected fictional demo disaster."
        )
    locations = json.loads(DEMO_LOCATIONS.read_text())
    definitions = demo_shelter_snapshots(locations)
    replacements = {old for site in locations["shelters"] for old in site.get("replaces", [])}
    stamp = timestamp(now())
    for site in definitions:
        existing = await (
            await connection.execute("SELECT disaster_id FROM shelters WHERE id=?", (site["id"],))
        ).fetchone()
        if existing is not None and existing[0] != DEMO_DISASTER_ID:
            raise ValueError(f"Shelter {site['id']} belongs to a different disaster.")
        await connection.execute(
            "INSERT INTO shelters (id,disaster_id,name,address,latitude,longitude,status,"
            "capacity_json,capabilities_json,resources_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,"
            "latitude=excluded.latitude,longitude=excluded.longitude,status=excluded.status,"
            "capacity_json=excluded.capacity_json,capabilities_json=excluded.capabilities_json,"
            "resources_json=excluded.resources_json,updated_at=excluded.updated_at",
            (
                site["id"],
                DEMO_DISASTER_ID,
                site["name"],
                site["address"],
                site["location"]["latitude"],
                site["location"]["longitude"],
                "open",
                json.dumps(site["capacity"]),
                json.dumps(site["capabilities"]),
                json.dumps(site["resources"]),
                stamp,
            ),
        )
        await connection.execute(
            "INSERT INTO shelter_capacity_budgets VALUES (?,?) "
            "ON CONFLICT(shelter_id) DO UPDATE SET allocation_budget=excluded.allocation_budget",
            (site["id"], site["allocation_budget"]),
        )
    for identity in sorted(replacements):
        await connection.execute(
            "UPDATE shelters SET status='closed' WHERE id=? AND disaster_id=?",
            (identity, DEMO_DISASTER_ID),
        )
    plans = await recompute_disasters(connection, (DEMO_DISASTER_ID,))
    for identity in sorted(replacements):
        await connection.execute(
            "DELETE FROM shelters WHERE id=? AND disaster_id=?", (identity, DEMO_DISASTER_ID)
        )
    return {"curated_shelters": len(definitions), "households_reallocated": len(plans)}


async def apply_update():
    async with connect() as connection:
        await connection.execute("BEGIN IMMEDIATE")
        try:
            result = await replace_demo_shelters(connection)
            await connection.execute("COMMIT")
        except BaseException:
            await connection.execute("ROLLBACK")
            raise
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=database_path())
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-dir", type=Path, default=Path(".runtime/shelter-backups"))
    args = parser.parse_args(argv)
    if not args.database.exists():
        parser.error("Database does not exist. This command never creates or reseeds a database.")
    with sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True) as db:
        row = db.execute("SELECT name FROM disasters WHERE id=?", (DEMO_DISASTER_ID,)).fetchone()
        if row is None or ("Golden Gate" not in str(row[0]) and not str(row[0]).startswith("Demo")):
            parser.error("Expected fictional demo disaster was not found.")
        before = db.execute(
            "SELECT COUNT(*) FROM shelters WHERE disaster_id=?", (DEMO_DISASTER_ID,)
        ).fetchone()[0]
        desired = demo_shelter_snapshots(json.loads(DEMO_LOCATIONS.read_text()))
        print(f"Demo shelter network: {before} existing sites → {len(desired)} curated hubs.")
        if not args.apply:
            print("Preview only. Add --apply to update shelters and recompute plans.")
            return 0
        args.backup_dir.mkdir(parents=True, exist_ok=True)
        backup = args.backup_dir / (datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ") + ".sqlite3")
        with sqlite3.connect(backup) as target:
            db.backup(target)
    os.environ["DATABASE_PATH"] = str(args.database.resolve())
    result = asyncio.run(apply_update())
    print(json.dumps({**result, "backup": str(backup.resolve())}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
