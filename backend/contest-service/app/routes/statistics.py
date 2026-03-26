from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import String, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models import Contest

router = APIRouter(prefix="/statistics", tags=["statistics"])


class SummaryItem(BaseModel):
    label: str
    value: float


class ChartDataset(BaseModel):
    label: str
    data: list[float]


class ChartData(BaseModel):
    labels: list[str]
    datasets: list[ChartDataset]


class ContestStatisticsOut(BaseModel):
    summary: list[SummaryItem]
    chart: ChartData


def _contest_group_column(group_by: str):
    if group_by == "status":
        return cast(Contest.status, String)
    if group_by == "created_month":
        return func.to_char(Contest.created_at, "YYYY-MM")
    if group_by == "end_month":
        return func.to_char(Contest.ends_at, "YYYY-MM")
    if group_by == "prizepool":
        return case(
            (Contest.prizepool < 10000, "< 10 тыс"),
            (Contest.prizepool < 50000, "10-50 тыс"),
            else_="50 тыс+",
        )
    return func.coalesce(Contest.type_id, 0)


def _to_float(value) -> float:
    return float(value or 0)


async def _build_contest_statistics(
    db: AsyncSession,
    group_by: str,
    metric: str,
    date_from: datetime | None,
    date_to: datetime | None,
    status: str | None,
    type_id: int | None,
) -> ContestStatisticsOut:
    group_col = _contest_group_column(group_by)
    value_col = (
        func.sum(Contest.prizepool) if metric == "prize_sum" else func.count(Contest.id)
    )
    dataset_label = (
        "Сумма призовых фондов" if metric == "prize_sum" else "Количество конкурсов"
    )

    chart_stmt = (
        select(group_col.label("label"), value_col.label("value"))
        .select_from(Contest)
        .group_by(group_col)
        .order_by(group_col)
    )
    summary_stmt = select(
        func.count(Contest.id),
        func.sum(Contest.prizepool),
        func.sum(case((Contest.status == "active", 1), else_=0)),
        func.sum(case((Contest.status == "finished", 1), else_=0)),
    ).select_from(Contest)

    if date_from:
        chart_stmt = chart_stmt.where(Contest.created_at >= date_from)
        summary_stmt = summary_stmt.where(Contest.created_at >= date_from)
    if date_to:
        chart_stmt = chart_stmt.where(Contest.created_at <= date_to)
        summary_stmt = summary_stmt.where(Contest.created_at <= date_to)
    if status:
        chart_stmt = chart_stmt.where(Contest.status == status)
        summary_stmt = summary_stmt.where(Contest.status == status)
    if type_id is not None:
        chart_stmt = chart_stmt.where(Contest.type_id == type_id)
        summary_stmt = summary_stmt.where(Contest.type_id == type_id)

    chart_rows = (await db.execute(chart_stmt)).all()
    total_count, total_prizepool, active_count, finished_count = (
        await db.execute(summary_stmt)
    ).one()

    return ContestStatisticsOut(
        summary=[
            SummaryItem(label="Конкурсов", value=_to_float(total_count)),
            SummaryItem(label="Сумма призов", value=_to_float(total_prizepool)),
            SummaryItem(label="Активных", value=_to_float(active_count)),
            SummaryItem(label="Завершённых", value=_to_float(finished_count)),
        ],
        chart=ChartData(
            labels=[
                str(row.label) if row.label is not None else "Не указано"
                for row in chart_rows
            ],
            datasets=[
                ChartDataset(
                    label=dataset_label,
                    data=[_to_float(row.value) for row in chart_rows],
                )
            ],
        ),
    )


@router.get("/contests", response_model=ContestStatisticsOut)
async def get_contest_statistics(
    group_by: str = Query("type"),
    metric: str = Query("count"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    status: str | None = Query(None),
    type_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    return await _build_contest_statistics(
        db=db,
        group_by=group_by,
        metric=metric,
        date_from=date_from,
        date_to=date_to,
        status=status,
        type_id=type_id,
    )


@router.get("")
async def get_legacy_statistics(
    x: str = Query("type"),
    y: str = Query("count"),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    group_by = {
        "createdAt": "created_month",
        "endBy": "end_month",
        "prizepool": "prizepool",
    }.get(x, x)
    group_col = _contest_group_column(group_by)
    value_col = (
        func.sum(Contest.prizepool) if y == "prizepool" else func.count(Contest.id)
    )
    dataset_label = "Сумма призов (₽)" if y == "prizepool" else "Количество"

    stmt = (
        select(group_col.label("x_val"), value_col.label("y_val"))
        .select_from(Contest)
        .group_by(group_col)
        .order_by(group_col)
    )
    rows = (await db.execute(stmt)).all()

    return {
        "x_labels": [
            str(row.x_val) if row.x_val is not None else "Без типа" for row in rows
        ],
        "datasets": [
            {
                "label": dataset_label,
                "data": [_to_float(row.y_val) for row in rows],
            }
        ],
    }
