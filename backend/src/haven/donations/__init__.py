"""Donation distribution and supply logistics: hubs, citizen requests and pledges, organizations,
inventory, needs, and shipments."""

from litestar import Router

from haven.donations import hubs, logistics, pledges, supply_requests

HANDLERS = [
    *hubs.HANDLERS,
    *supply_requests.HANDLERS,
    *pledges.HANDLERS,
    *logistics.HANDLERS,
]

router = Router(path="/", route_handlers=HANDLERS, tags=["Donations"])
