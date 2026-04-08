import asyncio

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
DB_INIT_ATTEMPTS = 10
DB_INIT_DELAY_SECONDS = 2


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def create_tables():
    last_error = None
    for attempt in range(1, DB_INIT_ATTEMPTS + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return
        except Exception as exc:
            last_error = exc
            if attempt == DB_INIT_ATTEMPTS:
                raise
            await asyncio.sleep(DB_INIT_DELAY_SECONDS)

    raise RuntimeError(f"Database initialization failed: {last_error}")
