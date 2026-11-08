"""The old nearest-shelter baseline, kept only for comparison with Haven's allocation.

Each household is sent to the geographically closest shelter that is open or full.
Needs, capacity, and supplies are deliberately ignored; this module is not used by
the allocator and exists so the evacuation preview can show what the old approach
would have done.
"""

from typing import Any

from haven.allocation_policy import distance


def allocate_nearest(
    families: list[dict[str, Any]], shelters: list[dict[str, Any]]
) -> dict[str, dict[str, Any] | None]:
    """Map every family id to its nearest open or full shelter (ties by shelter id)."""
    destinations = sorted(
        (shelter for shelter in shelters if shelter["status"] in {"open", "full"}),
        key=lambda shelter: shelter["id"],
    )
    result: dict[str, dict[str, Any] | None] = {}
    for family in families:
        # min() keeps the first minimum, and destinations are already ordered by id.
        result[family["id"]] = (
            min(destinations, key=lambda shelter: distance(family, shelter))
            if destinations
            else None
        )
    return result
