from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import ContestType
from app.dependencies import require_role

router = APIRouter(prefix="/contest-types", tags=["contest-types"])


class ContestTypeCreate(BaseModel):
    name: str


class ContestTypeOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ContestTypeOut])
async def list_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContestType))
    return result.scalars().all()


@router.post("", response_model=ContestTypeOut, status_code=201)
async def create_type(
    data: ContestTypeCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    ct = ContestType(name=data.name)
    db.add(ct)
    await db.commit()
    await db.refresh(ct)
    return ct


@router.get("/{type_id}", response_model=ContestTypeOut)
async def get_type(type_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContestType).where(ContestType.id == type_id))
    ct = result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Contest type not found")
    return ct


@router.delete("/{type_id}", status_code=204)
async def delete_type(
    type_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    result = await db.execute(select(ContestType).where(ContestType.id == type_id))
    ct = result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Contest type not found")
    await db.delete(ct)
    await db.commit()
