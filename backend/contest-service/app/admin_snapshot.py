import enum
import shutil
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import Boolean, DateTime, Float, Integer, Numeric, delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base

UPLOADS_DIR = Path("/app/uploads")


def _serialize_value(value):
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _deserialize_value(column, value):
    if value is None:
        return None

    column_type = column.type
    if isinstance(column_type, DateTime):
        return datetime.fromisoformat(value)
    if isinstance(column_type, Integer):
        return int(value)
    if isinstance(column_type, Float):
        return float(value)
    if isinstance(column_type, Numeric):
        return Decimal(str(value))
    if isinstance(column_type, Boolean):
        return bool(value)
    return value


async def export_snapshot(db: AsyncSession) -> dict:
    tables: dict[str, list[dict]] = {}
    for table in Base.metadata.sorted_tables:
        result = await db.execute(select(table))
        tables[table.name] = [
            {key: _serialize_value(value) for key, value in row.items()}
            for row in result.mappings().all()
        ]
    return {"tables": tables}


async def import_snapshot(db: AsyncSession, tables: dict[str, list[dict]]) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        await db.execute(delete(table))

    for table in Base.metadata.sorted_tables:
        rows = tables.get(table.name, [])
        if not rows:
            continue
        prepared_rows = [
            {
                column.name: _deserialize_value(column, row.get(column.name))
                for column in table.columns
                if column.name in row
            }
            for row in rows
        ]
        await db.execute(table.insert(), prepared_rows)

    await db.commit()

    for table in Base.metadata.sorted_tables:
        if "id" not in table.c:
            continue
        await db.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                f"COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM {table.name}"
            )
        )

    await db.commit()


def clear_uploads_dir() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    for path in UPLOADS_DIR.iterdir():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
