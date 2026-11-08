"""Refresh the offline demo geography from public Collier County GIS layers.

Run explicitly with Python; normal demo seeding never needs network access.
Only public addresses and geometry are requested, never property-owner data.
"""

import json
import random
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = "https://services2.arcgis.com/SlIq32SqARUHIhSx/arcgis/rest/services/"
ADDRESSES = ROOT + "Site_Address_Points_b/FeatureServer/3"
BUILDINGS = ROOT + "Buildings/FeatureServer/1"
BOUNDS = [-81.68, 26.17, -81.48, 26.34]  # west, south, east, north
OUTPUT = Path(__file__).resolve().parents[1] / "src/haven/data/golden_gate_estates.json"
SCHOOLS = (
    ("Palmetto Ridge High School", "1655 Victory LN, Naples"),
    ("Corkscrew Middle School", "1165 Oil Well RD, Naples"),
    ("Cypress Palm Middle School", "4255 18th AVE NE, Naples"),
    ("Sabal Palm Elementary School", "4095 18th AVE NE, Naples"),
    ("Big Cypress Elementary School", "3250 Golden Gate BLVD W, Naples"),
    ("Estates Elementary School", "5945 Everglades BLVD N, Naples"),
    ("Corkscrew Elementary School", "1065 Oil Well RD, Naples"),
)


def query(layer, **params):
    request = Request(
        layer + "/query",
        data=urlencode({"f": "json", "where": "1=1", **params}).encode(),
    )
    with urlopen(request, timeout=60) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(result["error"])
    return result


def features(layer, **params):
    result = []
    while True:
        page = query(layer, resultOffset=len(result), resultRecordCount=2000, **params)
        result.extend(page["features"])
        if not page.get("exceededTransferLimit"):
            return result
        if not page["features"]:
            raise RuntimeError("GIS pagination stopped before all features were returned")


def contains(rings, x, y):
    """Even/odd polygon test, including holes and multipart footprints."""
    inside = False
    for ring in rings:
        for (ax, ay), (bx, by) in zip(ring, ring[1:]):
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                inside = not inside
    return inside


def match_homes(candidates, buildings):
    # Bucket footprint bounds to avoid testing every home against every polygon.
    buckets = defaultdict(list)
    for building in buildings:
        rings = building["geometry"]["rings"]
        coords = [point for ring in rings for point in ring]
        for gx in range(
            int(min(p[0] for p in coords) * 1000), int(max(p[0] for p in coords) * 1000) + 1
        ):
            for gy in range(
                int(min(p[1] for p in coords) * 1000), int(max(p[1] for p in coords) * 1000) + 1
            ):
                buckets[gx, gy].append(building)
    homes, seen_addresses, seen_buildings = [], set(), set()
    for candidate in candidates:
        attrs, point = candidate["attributes"], candidate["geometry"]
        x, y = round(point["x"], 8), round(point["y"], 8)
        west, south, east, north = BOUNDS
        if not (west <= x <= east and south <= y <= north):
            continue
        for building in buckets[int(x * 1000), int(y * 1000)]:
            building_id = building["attributes"]["OBJECTID"]
            if (
                building_id not in seen_buildings
                and attrs["FULLADDR"] not in seen_addresses
                and contains(building["geometry"]["rings"], x, y)
            ):
                homes.append(
                    {
                        "address": attrs["FULLADDR"] + ", FL",
                        "latitude": y,
                        "longitude": x,
                        "address_point_id": attrs["OBJECTID"],
                        "building_id": building_id,
                    }
                )
                seen_addresses.add(attrs["FULLADDR"])
                seen_buildings.add(building_id)
                break
        if len(homes) == 1000:
            return homes
    raise RuntimeError(f"Only {len(homes)} distinct homes intersect building footprints")


def main():
    numbered_roads = " OR ".join(
        f"FULLNAME LIKE '% {kind} {quadrant}'"
        for kind in ("AVE", "ST")
        for quadrant in ("NE", "NW", "SE", "SW")
    )
    main_roads = " OR ".join(
        f"FULLNAME = '{road}'"
        for road in (
            "Wilson BLVD N",
            "Wilson BLVD S",
            "Everglades BLVD N",
            "Everglades BLVD S",
            "Golden Gate BLVD E",
            "Golden Gate BLVD W",
        )
    )
    candidates = features(
        ADDRESSES,
        where=f"POINTTYPE = 'Single Family' AND STATUS = 'Current' "
        f"AND ({numbered_roads} OR {main_roads})",
        geometry=",".join(map(str, BOUNDS)),
        geometryType="esriGeometryEnvelope",
        inSR=4326,
        outSR=4326,
        outFields="OBJECTID,FULLADDR",
        orderByFields="OBJECTID",
    )
    random.Random(42).shuffle(candidates)
    candidates = candidates[:1800]
    buildings = features(
        BUILDINGS,
        geometry=json.dumps(
            {
                "points": [[p["geometry"]["x"], p["geometry"]["y"]] for p in candidates],
                "spatialReference": {"wkid": 4326},
            }
        ),
        geometryType="esriGeometryMultipoint",
        spatialRel="esriSpatialRelIntersects",
        inSR=4326,
        outSR=4326,
        outFields="OBJECTID",
        orderByFields="OBJECTID",
    )
    homes = match_homes(candidates, buildings)
    shelters = []
    for name, address in SCHOOLS:
        matches = features(
            ADDRESSES,
            where=f"FULLADDR = '{address}' AND POINTTYPE <> 'Utility Asset'",
            outSR=4326,
            outFields="OBJECTID,FULLADDR",
        )
        if len(matches) != 1:
            raise RuntimeError(f"Expected exactly one school address for {name}")
        point = matches[0]
        shelters.append(
            {
                "name": name,
                "address": address + ", FL 34120",
                "latitude": round(point["geometry"]["y"], 8),
                "longitude": round(point["geometry"]["x"], 8),
                "address_point_id": point["attributes"]["OBJECTID"],
            }
        )
    data = {
        "area": "Golden Gate Estates, Naples, Florida",
        "retrieved_at": datetime.now(UTC).isoformat(),
        "sources": {"addresses": ADDRESSES, "building_footprints_2025": BUILDINGS},
        "bounds": BOUNDS,
        "selection": "Current Single Family address points on Estates roads, sampled with "
        "seed 42; each point intersects a distinct 2025 building footprint.",
        "households": homes,
        "shelters": shelters,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(homes)} homes and {len(shelters)} school sites to {OUTPUT}")


if __name__ == "__main__":
    main()
