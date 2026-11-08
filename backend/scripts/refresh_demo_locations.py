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
# Curated public locations are intentionally grouped by walkable campus/site.
# Keep IDs stable because demo records may refer to a shelter after a refresh.
# Coordinates are resolved from the public County address layer each refresh.
SHELTER_HUBS = (
    {
        "id": "shelter_01",
        "name": "Palmetto Ridge / Corkscrew School Hub",
        "addresses": (
            ("Palmetto Ridge High School", "1655 Victory LN, Naples"),
            ("Corkscrew Middle School", "1165 Oil Well RD, Naples"),
            ("Corkscrew Elementary School", "1065 Oil Well RD, Naples"),
        ),
        "replaces": ["shelter_02", "shelter_07"],
        "sources": ["https://www.collierschools.com/schools"],
    },
    {
        "id": "shelter_04",
        "name": "Cypress Palm / Sabal Palm School Hub",
        "addresses": (
            ("Cypress Palm Middle School", "4255 18th AVE NE, Naples"),
            ("Sabal Palm Elementary School", "4095 18th AVE NE, Naples"),
        ),
        "replaces": ["shelter_03"],
        "sources": ["https://www.collierschools.com/schools"],
    },
    {
        "id": "shelter_05",
        "name": "Big Cypress / Max Hasse Community Hub",
        "addresses": (
            ("Big Cypress Elementary School", "3250 Golden Gate BLVD W, Naples"),
            ("Max A. Hasse Jr. Community Park", "3390 Golden Gate BLVD W, Naples"),
        ),
        "replaces": [],
        "sources": [
            "https://www.collierschools.com/schools",
            "https://www.collierparks.com/Parks-and-Beaches/Community-Parks/Max-A-Hasse-Jr-Community-Park",
        ],
    },
    {
        "id": "shelter_06",
        "name": "Estates Elementary School",
        "addresses": (("Estates Elementary School", "5945 Everglades BLVD N, Naples"),),
        "replaces": [],
        "sources": ["https://www.collierschools.com/schools"],
    },
    {
        "id": "shelter_08",
        "name": "Big Corkscrew Island Regional Park",
        "addresses": (("Big Corkscrew Island Regional Park", "810 39th AVE NE, Naples"),),
        "replaces": [],
        "sources": [
            "https://www.collierparks.com/Parks-and-Beaches/Regional-Parks/Big-Corkscrew-Island-Regional-Park",
            "https://apps.sfwmd.gov/entsb/docdownload?object_id=0900eeea8a9341dc",
        ],
    },
    {
        "id": "shelter_09",
        "name": "Estates Branch Library",
        "addresses": (("Estates Branch Library", "1266 Golden Gate BLVD W, Naples"),),
        "replaces": [],
        "sources": ["https://library.collier.gov/About-Us/Locations/Estates-Branch"],
    },
    {
        "id": "shelter_10",
        "name": "Palmetto Elementary School",
        "addresses": (("Palmetto Elementary School", "3000 10th AVE SE, Naples"),),
        "replaces": [],
        "sources": ["https://www.collierschools.com/schools"],
    },
    {
        "id": "shelter_11",
        "name": "Bear Creek Elementary School",
        "addresses": (("Bear Creek Elementary School", "2400 Cub CT, Naples"),),
        "replaces": [],
        "sources": ["https://www.collierschools.com/schools"],
    },
    {
        "id": "shelter_12",
        "name": "Greater Naples Fire Rescue Station 74",
        "addresses": (("Greater Naples Fire Rescue Station 74", "99 Desoto BLVD S, Naples"),),
        "replaces": [],
        "sources": ["https://greaternaplesfire.org/locations/"],
    },
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


def match_shelter_address(address):
    """Resolve a named public site through the County's public address layer."""
    matches = features(
        ADDRESSES,
        where=f"UPPER(FULLADDR) LIKE '%{address.upper()}%'",
        outSR=4326,
        outFields="OBJECTID,FULLADDR",
    )
    # The 810 39th Ave NE park address has several address points across its
    # facility; averaging those points gives a stable site-level map marker.
    street = address.split(",")[0].upper()
    matches = [
        match
        for match in matches
        if match["attributes"]["FULLADDR"].upper().startswith(street + ",")
    ]
    if not matches:
        raise RuntimeError(f"No County GIS address point found for {address}")
    return matches


def shelter_sites():
    shelters = []
    for hub in SHELTER_HUBS:
        points = [
            point for _, address in hub["addresses"] for point in match_shelter_address(address)
        ]
        shelters.append(
            {
                "id": hub["id"],
                "name": hub["name"],
                "address": hub["addresses"][0][1] + ", FL",
                "latitude": round(sum(point["geometry"]["y"] for point in points) / len(points), 8),
                "longitude": round(
                    sum(point["geometry"]["x"] for point in points) / len(points), 8
                ),
                "address_point_ids": [point["attributes"]["OBJECTID"] for point in points],
                "members": [name for name, _ in hub["addresses"]],
                "replaces": hub["replaces"],
                "sources": hub["sources"],
            }
        )
    return shelters


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
    shelters = shelter_sites()
    data = {
        "area": "Golden Gate Estates, Naples, Florida",
        "retrieved_at": datetime.now(UTC).isoformat(),
        "sources": {
            "addresses": ADDRESSES,
            "building_footprints_2025": BUILDINGS,
            "official_school_directory": "https://www.collierschools.com/schools",
            "collier_county_parks": "https://www.collierparks.com/",
            "collier_county_public_library": "https://library.collier.gov/About-Us/Locations",
            "greater_naples_fire_rescue": "https://greaternaplesfire.org/locations/",
        },
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
