from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Integer, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import EvaluationResult

router = APIRouter(prefix="/evaluation/statistics", tags=["evaluation-statistics"])


class SummaryItem(BaseModel):
    label: str
    value: float


class ChartDataset(BaseModel):
    label: str
    data: list[float]


class ChartData(BaseModel):
    labels: list[str]
    datasets: list[ChartDataset]


class EvaluationStatisticsOut(BaseModel):
    summary: list[SummaryItem]
    chart: ChartData


def _month_bucket(column):
    return func.to_char(column, "YYYY-MM")


def _score_band():
    return case(
        (EvaluationResult.compliance_score < 50, "0-49"),
        (EvaluationResult.compliance_score < 80, "50-79"),
        else_="80-100",
    )


def _to_float(value) -> float:
    return float(value or 0)


@router.get("", response_model=EvaluationStatisticsOut)
async def get_evaluation_statistics(
    group_by: str = Query("score_band"),
    metric: str = Query("count"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    contest_id: int | None = Query(None),
    critical_only: bool = Query(False),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    if group_by == "contest":
        group_col = EvaluationResult.contest_id
    elif group_by == "month":
        group_col = _month_bucket(EvaluationResult.created_at)
    else:
        group_col = _score_band()

    if metric == "avg_score":
        value_col = func.avg(EvaluationResult.compliance_score)
        dataset_label = "Средний балл"
    elif metric == "critical_count":
        value_col = func.sum(cast(EvaluationResult.critical_issues, Integer))
        dataset_label = "Критические нарушения"
    else:
        value_col = func.count(EvaluationResult.id)
        dataset_label = "Количество оценок"

    chart_stmt = (
        select(group_col.label("label"), value_col.label("value"))
        .select_from(EvaluationResult)
        .group_by(group_col)
        .order_by(group_col)
    )
    summary_stmt = select(
        func.count(EvaluationResult.id),
        func.avg(EvaluationResult.compliance_score),
        func.sum(cast(EvaluationResult.critical_issues, Integer)),
        func.count(func.distinct(EvaluationResult.contest_id)),
    ).select_from(EvaluationResult)

    if date_from:
        chart_stmt = chart_stmt.where(EvaluationResult.created_at >= date_from)
        summary_stmt = summary_stmt.where(EvaluationResult.created_at >= date_from)
    if date_to:
        chart_stmt = chart_stmt.where(EvaluationResult.created_at <= date_to)
        summary_stmt = summary_stmt.where(EvaluationResult.created_at <= date_to)
    if contest_id is not None:
        chart_stmt = chart_stmt.where(EvaluationResult.contest_id == contest_id)
        summary_stmt = summary_stmt.where(EvaluationResult.contest_id == contest_id)
    if critical_only:
        chart_stmt = chart_stmt.where(EvaluationResult.critical_issues.is_(True))
        summary_stmt = summary_stmt.where(EvaluationResult.critical_issues.is_(True))

    chart_rows = (await db.execute(chart_stmt)).all()
    total_count, avg_score, critical_count, contest_count = (
        await db.execute(summary_stmt)
    ).one()

    return EvaluationStatisticsOut(
        summary=[
            SummaryItem(label="Оценок", value=_to_float(total_count)),
            SummaryItem(label="Средний балл", value=_to_float(avg_score)),
            SummaryItem(label="Критических нарушений", value=_to_float(critical_count)),
            SummaryItem(label="Конкурсов", value=_to_float(contest_count)),
        ],
        chart=ChartData(
            labels=[
                str(row.label) if row.label is not None else "Не указано"
                for row in chart_rows
            ],
            datasets=[
                ChartDataset(
                    label=dataset_label,
                    data=[round(_to_float(row.value), 2) for row in chart_rows],
                )
            ],
        ),
    )
