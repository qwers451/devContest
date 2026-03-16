from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import create_tables
from app.routes.contest_types import router as types_router
from app.routes.contest_templates import router as templates_router
from app.routes.contests import router as contests_router
from app.routes.submissions import router as submissions_router
from app.routes.statistics import router as statistics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(title="Contest Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
)

app.include_router(types_router)
app.include_router(templates_router)
app.include_router(contests_router)
app.include_router(submissions_router)
app.include_router(statistics_router)
