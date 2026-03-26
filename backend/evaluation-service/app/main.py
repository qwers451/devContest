from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_tables
from app.routes.evaluation import router as evaluation_router
from app.routes.internal_admin import router as internal_admin_router
from app.routes.statistics import router as statistics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(title="Evaluation Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(statistics_router)
app.include_router(evaluation_router)
app.include_router(internal_admin_router)
