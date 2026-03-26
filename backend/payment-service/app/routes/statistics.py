from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Numeric, String, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Payment, Payout, WalletTransaction

router = APIRouter(prefix="/payments/statistics", tags=["payment-statistics"])


class SummaryItem(BaseModel):
    label: str
    value: float


class ChartDataset(BaseModel):
    label: str
    data: list[float]


class ChartData(BaseModel):
    labels: list[str]
    datasets: list[ChartDataset]


class PaymentStatisticsOut(BaseModel):
    summary: list[SummaryItem]
    chart: ChartData


def _month_bucket(column):
    return func.to_char(column, "YYYY-MM")


def _to_float(value) -> float:
    return float(value or 0)


@router.get("", response_model=PaymentStatisticsOut)
async def get_payment_statistics(
    scope: str = Query("payments"),
    group_by: str = Query("status"),
    metric: str = Query("amount"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    payment_status: str | None = Query(None),
    tx_type: str | None = Query(None),
    payout_status: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    if scope == "wallet":
        group_col = (
            cast(WalletTransaction.tx_type, String)
            if group_by == "type"
            else _month_bucket(WalletTransaction.created_at)
        )
        value_col = (
            func.sum(cast(WalletTransaction.amount, Numeric))
            if metric == "amount"
            else func.count(WalletTransaction.id)
        )
        chart_stmt = (
            select(group_col.label("label"), value_col.label("value"))
            .select_from(WalletTransaction)
            .group_by(group_col)
            .order_by(group_col)
        )
        if date_from:
            chart_stmt = chart_stmt.where(WalletTransaction.created_at >= date_from)
        if date_to:
            chart_stmt = chart_stmt.where(WalletTransaction.created_at <= date_to)
        if tx_type:
            chart_stmt = chart_stmt.where(WalletTransaction.tx_type == tx_type)
        dataset_label = (
            "Сумма операций кошелька"
            if metric == "amount"
            else "Количество операций кошелька"
        )
    elif scope == "payouts":
        group_col = (
            cast(Payout.status, String)
            if group_by == "status"
            else _month_bucket(Payout.created_at)
        )
        value_col = (
            func.sum(cast(Payout.amount, Numeric))
            if metric == "amount"
            else func.count(Payout.id)
        )
        chart_stmt = (
            select(group_col.label("label"), value_col.label("value"))
            .select_from(Payout)
            .group_by(group_col)
            .order_by(group_col)
        )
        if date_from:
            chart_stmt = chart_stmt.where(Payout.created_at >= date_from)
        if date_to:
            chart_stmt = chart_stmt.where(Payout.created_at <= date_to)
        if payout_status:
            chart_stmt = chart_stmt.where(Payout.status == payout_status)
        dataset_label = "Сумма выплат" if metric == "amount" else "Количество выплат"
    else:
        group_col = (
            cast(Payment.status, String)
            if group_by == "status"
            else _month_bucket(Payment.created_at)
        )
        value_col = (
            func.sum(cast(Payment.amount, Numeric))
            if metric == "amount"
            else func.count(Payment.id)
        )
        chart_stmt = (
            select(group_col.label("label"), value_col.label("value"))
            .select_from(Payment)
            .group_by(group_col)
            .order_by(group_col)
        )
        if date_from:
            chart_stmt = chart_stmt.where(Payment.created_at >= date_from)
        if date_to:
            chart_stmt = chart_stmt.where(Payment.created_at <= date_to)
        if payment_status:
            chart_stmt = chart_stmt.where(Payment.status == payment_status)
        dataset_label = (
            "Сумма платежей" if metric == "amount" else "Количество платежей"
        )

    chart_rows = (await db.execute(chart_stmt)).all()

    payments_summary_stmt = select(
        func.count(Payment.id),
        func.sum(cast(Payment.amount, Numeric)),
        func.sum(case((Payment.status == "refunded", 1), else_=0)),
    )
    wallet_summary_stmt = select(
        func.count(WalletTransaction.id),
        func.sum(cast(WalletTransaction.amount, Numeric)),
    )
    payout_summary_stmt = select(
        func.count(Payout.id),
        func.sum(cast(Payout.amount, Numeric)),
    )

    if date_from:
        payments_summary_stmt = payments_summary_stmt.where(
            Payment.created_at >= date_from
        )
        wallet_summary_stmt = wallet_summary_stmt.where(
            WalletTransaction.created_at >= date_from
        )
        payout_summary_stmt = payout_summary_stmt.where(Payout.created_at >= date_from)
    if date_to:
        payments_summary_stmt = payments_summary_stmt.where(
            Payment.created_at <= date_to
        )
        wallet_summary_stmt = wallet_summary_stmt.where(
            WalletTransaction.created_at <= date_to
        )
        payout_summary_stmt = payout_summary_stmt.where(Payout.created_at <= date_to)

    payments_count, payments_amount, refunds_count = (
        await db.execute(payments_summary_stmt)
    ).one()
    wallet_count, _wallet_amount = (await db.execute(wallet_summary_stmt)).one()
    payout_count, payout_amount = (await db.execute(payout_summary_stmt)).one()

    return PaymentStatisticsOut(
        summary=[
            SummaryItem(label="Платежей", value=_to_float(payments_count)),
            SummaryItem(label="Сумма платежей", value=_to_float(payments_amount)),
            SummaryItem(label="Операций кошелька", value=_to_float(wallet_count)),
            SummaryItem(label="Сумма выплат", value=_to_float(payout_amount)),
            SummaryItem(label="Возвратов", value=_to_float(refunds_count)),
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
