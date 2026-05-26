from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clients import build_summary, fetch_all_service_statuses
from app.config import settings
from app.database import get_db
from app.dependencies import require_admin_or_internal
from app.models import MonitoringCheckRun, ServiceCheckSnapshot

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


class HealthOut(BaseModel):
    service_name: str
    status: Literal["ok"]
    checked_at: datetime


class ServiceStatusOut(BaseModel):
    service_name: str
    base_url: str
    health_url: str
    status: Literal["healthy", "unhealthy"]
    http_status: int | None = None
    latency_ms: float
    checked_at: datetime
    detail: str | None = None

    model_config = {"from_attributes": True}


class CheckRunOut(BaseModel):
    id: int
    triggered_by_user_id: int | None = None
    triggered_by_role: str | None = None
    created_at: datetime
    service_count: int
    healthy_count: int
    unhealthy_count: int
    overall_status: Literal["healthy", "degraded"]
    services: list[ServiceStatusOut]

    model_config = {"from_attributes": True}


class ServiceHistoryEntryOut(ServiceStatusOut):
    run_id: int
    run_created_at: datetime


@router.get("/health", response_model=HealthOut)
async def get_health():
    return HealthOut(
        service_name="monitoring-service",
        status="ok",
        checked_at=datetime.now(timezone.utc),
    )


def _serialize_run(run: MonitoringCheckRun) -> CheckRunOut:
    services = [ServiceStatusOut.model_validate(service) for service in run.services]
    return CheckRunOut(
        id=run.id,
        triggered_by_user_id=run.triggered_by_user_id,
        triggered_by_role=run.triggered_by_role,
        created_at=run.created_at,
        service_count=run.service_count,
        healthy_count=run.healthy_count,
        unhealthy_count=run.unhealthy_count,
        overall_status=run.overall_status,
        services=services,
    )


async def _get_run_or_404(run_id: int, db: AsyncSession) -> MonitoringCheckRun:
    result = await db.execute(
        select(MonitoringCheckRun)
        .options(selectinload(MonitoringCheckRun.services))
        .where(MonitoringCheckRun.id == run_id)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Check run not found")
    return run


async def _get_latest_run_or_404(db: AsyncSession) -> MonitoringCheckRun:
    result = await db.execute(
        select(MonitoringCheckRun)
        .options(selectinload(MonitoringCheckRun.services))
        .order_by(MonitoringCheckRun.created_at.desc(), MonitoringCheckRun.id.desc())
        .limit(1)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="No check runs found")
    return run


def _ensure_known_service(service_name: str) -> None:
    if service_name not in settings.monitored_services():
        raise HTTPException(status_code=404, detail="Unknown service")


@router.post(
    "/check-runs",
    response_model=CheckRunOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_check_run(
    principal: dict = Depends(require_admin_or_internal),
    db: AsyncSession = Depends(get_db),
):
    statuses = await fetch_all_service_statuses()
    summary = build_summary(statuses)

    run = MonitoringCheckRun(
        triggered_by_user_id=principal.get("id"),
        triggered_by_role=principal.get("role") or principal.get("auth_type"),
        service_count=summary["service_count"],
        healthy_count=summary["healthy_count"],
        unhealthy_count=summary["unhealthy_count"],
        overall_status=summary["overall_status"],
        services=[ServiceCheckSnapshot(**service_status) for service_status in statuses],
    )

    db.add(run)
    try:
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to persist check run",
        ) from exc

    return _serialize_run(await _get_run_or_404(run.id, db))


@router.get("/check-runs/latest", response_model=CheckRunOut)
async def get_latest_check_run(
    _: dict = Depends(require_admin_or_internal),
    db: AsyncSession = Depends(get_db),
):
    return _serialize_run(await _get_latest_run_or_404(db))


@router.get("/check-runs/{run_id}", response_model=CheckRunOut)
async def get_check_run(
    run_id: int,
    _: dict = Depends(require_admin_or_internal),
    db: AsyncSession = Depends(get_db),
):
    return _serialize_run(await _get_run_or_404(run_id, db))


@router.get("/services/latest", response_model=CheckRunOut)
async def get_latest_services(
    _: dict = Depends(require_admin_or_internal),
    db: AsyncSession = Depends(get_db),
):
    return _serialize_run(await _get_latest_run_or_404(db))


@router.get("/services/{service_name}/history", response_model=list[ServiceHistoryEntryOut])
async def get_service_history(
    service_name: str,
    limit: int = Query(20, ge=1, le=100),
    _: dict = Depends(require_admin_or_internal),
    db: AsyncSession = Depends(get_db),
):
    _ensure_known_service(service_name)

    result = await db.execute(
        select(ServiceCheckSnapshot, MonitoringCheckRun.created_at)
        .join(MonitoringCheckRun, MonitoringCheckRun.id == ServiceCheckSnapshot.run_id)
        .where(ServiceCheckSnapshot.service_name == service_name)
        .order_by(MonitoringCheckRun.created_at.desc(), ServiceCheckSnapshot.id.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        ServiceHistoryEntryOut(
            run_id=snapshot.run_id,
            run_created_at=run_created_at,
            **ServiceStatusOut.model_validate(snapshot).model_dump(),
        )
        for snapshot, run_created_at in rows
    ]
