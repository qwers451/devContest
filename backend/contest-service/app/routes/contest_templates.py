from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models import ContestTemplate
from app.dependencies import require_role

router = APIRouter(prefix="/contest-templates", tags=["contest-templates"])


class ContestTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    tz_template: str | None = None


class ContestTemplateOut(BaseModel):
    id: int
    name: str
    description: str | None
    tz_template: str | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ContestTemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContestTemplate))
    return result.scalars().all()


@router.get("/{template_id}", response_model=ContestTemplateOut)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContestTemplate).where(ContestTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


@router.post("", response_model=ContestTemplateOut, status_code=201)
async def create_template(
    data: ContestTemplateCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    t = ContestTemplate(name=data.name, description=data.description, tz_template=data.tz_template)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.put("/{template_id}", response_model=ContestTemplateOut)
async def update_template(
    template_id: int,
    data: ContestTemplateCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    result = await db.execute(select(ContestTemplate).where(ContestTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    t.name = data.name
    t.description = data.description
    t.tz_template = data.tz_template
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    result = await db.execute(select(ContestTemplate).where(ContestTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(t)
    await db.commit()
