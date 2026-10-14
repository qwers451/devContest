import httpx
from fastapi import HTTPException

from app.config import settings


async def fetch_submission_context(submission_id: int) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.contest_service_url}/internal/submissions/{submission_id}/protocol-context",
                headers={"x-internal-secret": settings.internal_secret},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Contest service is unavailable: {exc}",
        ) from exc

    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Submission not found")
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Contest service returned {response.status_code}: {response.text}",
        )
    return response.json()
