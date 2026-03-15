from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text("ALTER TABLE contests ADD COLUMN IF NOT EXISTS tz_filename VARCHAR(300)")
        )
        await conn.execute(
            text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ai_score DOUBLE PRECISION")
        )
        await conn.execute(
            text("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS files JSON DEFAULT '[]'::json")
        )
        await conn.execute(
            text("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS critical_issues BOOLEAN")
        )
