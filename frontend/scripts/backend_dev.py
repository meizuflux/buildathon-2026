"""Local CORS wrapper; the backend imported from master is not modified."""
import os
from litestar.config.cors import CORSConfig
from litestar.middleware.cors import CORSMiddleware
from haven.app import app as upstream
origins = os.environ.get('HAVEN_ALLOWED_ORIGINS', 'http://localhost:8081,http://127.0.0.1:8081').split(',')
cors = CORSMiddleware(upstream, CORSConfig(allow_origins=origins, allow_methods=['GET', 'POST', 'PATCH', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'Idempotency-Key']))
async def app(scope, receive, send):
    if scope['type'] == 'http':
        scope['litestar_app'] = upstream
    await cors(scope, receive, send)
