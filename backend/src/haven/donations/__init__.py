"""Donation distribution: hubs, citizen supply requests, and drop-off pledges."""

from haven.donations import hubs, pledges, supply_requests

HANDLERS = [*hubs.HANDLERS, *supply_requests.HANDLERS, *pledges.HANDLERS]
