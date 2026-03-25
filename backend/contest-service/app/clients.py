import httpx

from app.config import settings


async def release_escrow(
    contest_id: int, executor_id: int, contest_title: str | None = None
) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{settings.payment_service_url}/escrow/release",
            json={
                "contest_id": contest_id,
                "executor_id": executor_id,
                "contest_title": contest_title,
            },
            headers={"x-internal-secret": settings.internal_secret},
        )
        resp.raise_for_status()
        return resp.json()


async def release_stage_escrow(
    contest_id: int,
    stage_id: int,
    executor_id: int,
    amount: float,
    stage_name: str | None = None,
    contest_title: str | None = None,
) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{settings.payment_service_url}/escrow/release-stage",
            json={
                "contest_id": contest_id,
                "stage_id": stage_id,
                "executor_id": executor_id,
                "amount": amount,
                "stage_name": stage_name,
                "contest_title": contest_title,
            },
            headers={"x-internal-secret": settings.internal_secret},
        )
        resp.raise_for_status()
        return resp.json()


async def check_escrow_held(contest_id: int) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.payment_service_url}/escrow/status/{contest_id}",
                headers={"x-internal-secret": settings.internal_secret},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("held", False)
    except Exception:
        pass
    return False


async def trigger_evaluation(
    submission_id: int,
    contest_id: int,
    tz_text: str,
    submission_text: str,
    images: list[str] | None = None,
    image_meta: list[dict] | None = None,
) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=660.0) as client:
            resp = await client.post(
                f"{settings.evaluation_service_url}/evaluation/evaluate",
                json={
                    "submission_id": submission_id,
                    "contest_id": contest_id,
                    "tz_text": tz_text,
                    "submission_text": submission_text,
                    "images": images or [],
                    "image_meta": image_meta or [],
                },
                headers={"x-internal-secret": settings.internal_secret},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None


async def get_user(user_id: int) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.user_service_url}/users/{user_id}")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None
