import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
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
                migrations = [
                    "ALTER TABLE payments ALTER COLUMN contest_id DROP NOT NULL",
                    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type VARCHAR DEFAULT 'contest'",
                    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS wallet_user_id INTEGER",
                    "ALTER TABLE payouts ALTER COLUMN contest_id DROP NOT NULL",
                    "ALTER TABLE payouts ADD COLUMN IF NOT EXISTS yookassa_payout_id VARCHAR",
                    "ALTER TABLE payouts ADD COLUMN IF NOT EXISTS recipient_account VARCHAR",
                ]
                from sqlalchemy import text

                for sql in migrations:
                    try:
                        await conn.execute(text(sql))
                    except Exception:
                        pass
            return
        except Exception as exc:
            last_error = exc
            if attempt == DB_INIT_ATTEMPTS:
                raise
            await asyncio.sleep(DB_INIT_DELAY_SECONDS)

    raise RuntimeError(f"Database initialization failed: {last_error}")
