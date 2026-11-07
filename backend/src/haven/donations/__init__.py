"""Citizen donations: hubs, matched requests and pledges, custom items, and automatic hub stock.

Built on the shared logistics tables (organizations, inventory, resource types) owned by
haven.routers.logistics."""

from litestar import Router

from haven.donations import custom, hubs, pledges, supply_requests

HANDLERS = [
    *hubs.HANDLERS,
    *supply_requests.HANDLERS,
    *pledges.HANDLERS,
    *custom.HANDLERS,
]

router = Router(path="/", route_handlers=HANDLERS, tags=["Donations"])
