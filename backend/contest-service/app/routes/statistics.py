from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, String, case
from app.database import get_db
from app.models import Contest
from app.dependencies import require_role

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("")
async def get_statistics(
    x: str = Query("type"),
    y: str = Query("count"),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    if x == "type":
        group_col = func.coalesce(Contest.type_id, 0)
    elif x == "status":
        group_col = cast(Contest.status, String)
    elif x == "createdAt":
        group_col = func.to_char(Contest.created_at, "YYYY-MM")
    elif x == "endBy":
        group_col = func.to_char(Contest.ends_at, "YYYY-MM")
    elif x == "prizepool":
        group_col = case(
            (Contest.prizepool < 10000, "< 10 тыс"),
            (Contest.prizepool < 50000, "10–50 тыс"),
            else_="50 тыс+",
        )
    else:
        group_col = func.coalesce(Contest.type_id, 0)

    y_agg = func.sum(Contest.prizepool) if y == "prizepool" else func.count(Contest.id)

    stmt = (
        select(group_col.label("x_val"), y_agg.label("y_val"))
        .group_by(group_col)
        .order_by(group_col)
    )
    result = await db.execute(stmt)
    rows = result.all()

    x_labels = [str(r.x_val) if r.x_val is not None else "Без типа" for r in rows]
    data = [int(r.y_val) if r.y_val is not None else 0 for r in rows]
    dataset_label = "Сумма призов (₽)" if y == "prizepool" else "Количество"

    return {"x_labels": x_labels, "datasets": [{"label": dataset_label, "data": data}]}
