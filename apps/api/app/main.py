# apps/api/app/main.py
from fastapi import FastAPI

from app.routers.auth import router as auth_router

# Initialize the FastAPI application
app = FastAPI(
    title="AutoHire KE API",
    version="0.1.0",
    description="Single-company Car Hire Management API for Kenya",
)

# All auth routes live under /api/v1, e.g. /api/v1/auth/login
app.include_router(auth_router, prefix="/api/v1")

# Our very first route: a simple health check to prove the server is alive
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "AutoHire KE API",
    }