from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.database import create_tables
from app.routes.escrow import router as escrow_router
from app.routes.internal_admin import router as internal_admin_router
from app.routes.payments import router as payments_router
from app.routes.statistics import router as statistics_router
from app.routes.transactions import router as transactions_router
from app.routes.wallet import router as wallet_router

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(title="Payment Service", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(statistics_router)
app.include_router(escrow_router)
app.include_router(payments_router)
app.include_router(transactions_router)
app.include_router(wallet_router)
app.include_router(internal_admin_router)
