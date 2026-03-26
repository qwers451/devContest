from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_snapshot import export_snapshot, import_snapshot
from app.database import get_db
from app.dependencies import verify_internal

router = APIRouter(prefix="/internal/admin", tags=["internal-admin"])


class SnapshotIn(BaseModel):
    tables: dict[str, list[dict]]


@router.get("/export", dependencies=[Depends(verify_internal)])
async def export_database_snapshot(db: AsyncSession = Depends(get_db)):
    return await export_snapshot(db)


@router.post("/import", dependencies=[Depends(verify_internal)])
async def import_database_snapshot(
    payload: SnapshotIn,
    db: AsyncSession = Depends(get_db),
):
    await import_snapshot(db, payload.tables)
    return {"status": "ok"}
