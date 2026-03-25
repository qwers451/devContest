from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
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
