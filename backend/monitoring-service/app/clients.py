import asyncio
from datetime import datetime, timezone
from time import perf_counter

import httpx

from app.config import settings


def build_health_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/docs"


async def fetch_service_status(
    client: httpx.AsyncClient,
    service_name: str,
    base_url: str,
) -> dict:
    checked_at = datetime.now(timezone.utc)
    started_at = perf_counter()
    health_url = build_health_url(base_url)

    try:
        response = await client.get(health_url)
        latency_ms = round((perf_counter() - started_at) * 1000, 2)
        status = "healthy" if response.status_code == 200 else "unhealthy"
        detail = None
        if response.status_code != 200:
            detail = f"Unexpected status {response.status_code}"
        return {
            "service_name": service_name,
            "base_url": base_url,
            "health_url": health_url,
            "status": status,
            "http_status": response.status_code,
            "latency_ms": latency_ms,
            "checked_at": checked_at,
            "detail": detail,
        }
    except httpx.HTTPError as exc:
        latency_ms = round((perf_counter() - started_at) * 1000, 2)
        return {
            "service_name": service_name,
            "base_url": base_url,
            "health_url": health_url,
            "status": "unhealthy",
            "http_status": None,
            "latency_ms": latency_ms,
            "checked_at": checked_at,
            "detail": str(exc),
        }


async def fetch_all_service_statuses() -> list[dict]:
    services = settings.monitored_services()
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        tasks = [
            fetch_service_status(client, service_name, base_url)
            for service_name, base_url in services.items()
        ]
        return list(await asyncio.gather(*tasks))


async def fetch_service_status_by_name(service_name: str) -> dict:
    services = settings.monitored_services()
    if service_name not in services:
        raise KeyError(service_name)

    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        return await fetch_service_status(client, service_name, services[service_name])


def build_summary(statuses: list[dict]) -> dict:
    checked_at = datetime.now(timezone.utc)
    healthy_count = sum(1 for status in statuses if status["status"] == "healthy")
    unhealthy_count = len(statuses) - healthy_count
    return {
        "checked_at": checked_at,
        "service_count": len(statuses),
        "healthy_count": healthy_count,
        "unhealthy_count": unhealthy_count,
        "overall_status": "healthy" if unhealthy_count == 0 else "degraded",
    }
