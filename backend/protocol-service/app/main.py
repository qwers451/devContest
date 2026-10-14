import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_tables
from app.routes.sessions import router as sessions_router

logger = logging.getLogger("protocol-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    logger.warning("strict_validation=%s", settings.strict_validation)
    yield


app = FastAPI(title="Protocol Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router)
