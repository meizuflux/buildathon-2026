"""Local CORS wrapper; the backend imported from master is not modified."""
import os
from litestar.config.cors import CORSConfig
from litestar.middleware.cors import CORSMiddleware
from haven.app import app as upstream
origins = [origin.strip() for origin in os.environ.get('HAVEN_ALLOWED_ORIGINS', '').split(',') if origin.strip()]
# Expo selects another port when 8081 is occupied. Permit loopback browser
# origins on any port, while LAN or deployed origins still need an explicit entry.
local_origins = r'^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$'
cors = CORSMiddleware(upstream, CORSConfig(allow_origins=origins, allow_origin_regex=local_origins, allow_methods=['GET', 'POST', 'PATCH', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'Idempotency-Key']))
async def app(scope, receive, send):
    if scope['type'] == 'http':
        scope['litestar_app'] = upstream
    await cors(scope, receive, send)
