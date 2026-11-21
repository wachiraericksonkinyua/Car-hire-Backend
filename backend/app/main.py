# backend/app/main.py
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import engine
from app.core.errors import register_exception_handlers
from app.core.middleware import RequestIDMiddleware
from app.jobs.scheduler import shutdown_scheduler, start_scheduler
from app.routers.audit import router as audit_router
from app.routers.auth import router as auth_router
from app.routers.bookings import router as bookings_router
from app.routers.dashboard import router as dashboard_router
from app.routers.drivers import router as drivers_router
from app.routers.health import router as health_router
from app.routers.incidents import router as incidents_router
from app.routers.mechanics import router as mechanics_router
from app.routers.payments import router as payments_router
from app.routers.public import router as public_router
from app.routers.quotes import router as quotes_router
from app.routers.staff import router as staff_router
from app.routers.system import router as system_router
from app.routers.vehicles import router as vehicles_router

logger = logging.getLogger("autohire.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Open the first pooled connection during startup so the first browser
    # request does not pay the remote database's TLS/connect latency.
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        logger.warning("Database warm-up failed", exc_info=False)

    scheduler = start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler(scheduler)


# Initialize the FastAPI application
app = FastAPI(
    title="AutoHire KE API",
    version="0.1.0",
    description="Single-company Car Hire Management API for Kenya",
    lifespan=lifespan,
)

# Envelope errors + request IDs. CORS origins come from the environment.
settings = get_settings()
register_exception_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestIDMiddleware)

# Local inspection-photo storage. Production should use object storage.
UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# All API routes live under /api/v1, e.g. /api/v1/auth/login
app.include_router(auth_router, prefix="/api/v1")
app.include_router(vehicles_router, prefix="/api/v1")
app.include_router(bookings_router, prefix="/api/v1")
app.include_router(payments_router, prefix="/api/v1")
app.include_router(mechanics_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
app.include_router(staff_router, prefix="/api/v1")
app.include_router(quotes_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(drivers_router, prefix="/api/v1")
app.include_router(incidents_router, prefix="/api/v1")
app.include_router(system_router, prefix="/api/v1")
app.include_router(public_router, prefix="/api/v1")

# Health check stays at the root (/health), outside the /api/v1 prefix.
app.include_router(health_router)
