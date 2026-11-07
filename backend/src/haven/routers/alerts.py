"""Current operational alerts, derived from one consistent database snapshot."""

import json
from typing import Annotated

from litestar import Router, get
from litestar.params import FromPath, QueryParameter

from haven.api_common import require_disaster
from haven.auth import operator_guard
from haven.db import connect
from haven.openapi import AlertPage, BEARER, errors


@get(
    "/disasters/{disaster_id:str}/alerts", tags=["Alerts"], security=BEARER,
    guards=[operator_guard], responses=errors(400, 401, 403, 404, 500),
    description="Operator only. Current alerts, critical first then newest first. Resolved conditions disappear; IDs stay stable while a condition persists.",
)
async def list_alerts(
    disaster_id: FromPath[str],
    limit: Annotated[int, QueryParameter(ge=1, le=1000)] = 100,
    offset: Annotated[int, QueryParameter(ge=0)] = 0,
) -> AlertPage:
    alerts = []

    def add(code, severity, message, updated_at, *, shelter_id=None, family_id=None, details=None):
        alerts.append({
            "id": f"{code}:{shelter_id or ''}:{family_id or ''}",
            "disaster_id": disaster_id, "code": code, "severity": severity,
            "message": message, "shelter_id": shelter_id, "family_id": family_id,
            "updated_at": updated_at, "details": details or {},
        })

    async with connect() as connection:
        await connection.execute("BEGIN")
        await require_disaster(connection, disaster_id)
        rows = await (await connection.execute(
            "SELECT s.id, s.name, s.status, s.capacity_json, s.resources_json, "
            "s.updated_at, COALESCE(SUM(a.people), 0), MAX(a.updated_at), b.allocation_budget "
            "FROM shelters s LEFT JOIN current_assignments a ON a.shelter_id = s.id "
            "LEFT JOIN shelter_capacity_budgets b ON b.shelter_id = s.id "
            "WHERE s.disaster_id = ? GROUP BY s.id", (disaster_id,),
        )).fetchall()
        for identity, name, status, raw_capacity, raw_resources, updated, assigned, assignment_updated, budget in rows:
            capacity = json.loads(raw_capacity)
            total = capacity["total_people"]
            over = max(0, assigned - total)
            over_budget = max(0, assigned - budget) if budget is not None else 0
            updated = max(updated, assignment_updated or updated)
            if over or over_budget or status == "full" or (status == "open" and capacity["available_people"] == 0):
                message = (f"{name} is over its listed capacity by {over} people. Coordinate overflow support."
                           if over else f"{name} has no reported free capacity. Coordinate overflow support.")
                add("shelter_capacity_overflow", "critical" if over else "warning", message, updated,
                    shelter_id=identity, details={"assigned_people": assigned, "total_people": total,
                    "people_over_capacity": over, "people_over_allocation_budget": over_budget})
            if status == "closed":
                continue
            for resource, availability in json.loads(raw_resources).items():
                if availability in ("limited", "unavailable"):
                    add(f"shelter_{resource}_{availability}", "critical" if availability == "unavailable" else "warning",
                        f"{name}: {resource} is {availability}. Coordinate supplies.", updated,
                        shelter_id=identity, details={"resource": resource, "availability": availability})

        plans = await (await connection.execute(
            "SELECT p.plan_json FROM families f JOIN plans p ON p.family_id = f.id "
            "AND p.version = (SELECT MAX(p2.version) FROM plans p2 WHERE p2.family_id = f.id) "
            "WHERE f.disaster_id = ?", (disaster_id,),
        )).fetchall()
        for (raw_plan,) in plans:
            plan = json.loads(raw_plan)
            for alert in plan.get("alerts", []):
                if alert["code"] == "shelter_capacity_overflow":
                    continue  # One authoritative capacity alert per shelter above.
                add(alert["code"], alert["severity"], alert["message"], plan["updated_at"],
                    shelter_id=alert.get("shelter_id"), family_id=plan["family_id"],
                    details={key: value for key, value in alert.items()
                             if key not in {"code", "severity", "message", "shelter_id"}})
        await connection.execute("COMMIT")

    # Stable ties make repeated paginated requests deterministic on unchanged data.
    alerts.sort(key=lambda alert: alert["id"])
    alerts.sort(key=lambda alert: alert["updated_at"], reverse=True)
    alerts.sort(key=lambda alert: {"critical": 0, "warning": 1, "info": 2}[alert["severity"]])
    return {"alerts": alerts[offset:offset + limit], "total": len(alerts), "limit": limit, "offset": offset}


router = Router(path="/", route_handlers=[list_alerts])
