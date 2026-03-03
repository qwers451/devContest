import httpx
from app.config import settings


async def reserve_escrow(contest_id: int, customer_id: int, amount: int) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{settings.payment_service_url}/escrow/reserve",
            json={"contest_id": contest_id, "customer_id": customer_id, "amount": amount},
            headers={"x-internal-secret": settings.internal_secret},
        )
        resp.raise_for_status()
        return resp.json()


async def release_escrow(contest_id: int, executor_id: int) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{settings.payment_service_url}/escrow/release",
            json={"contest_id": contest_id, "executor_id": executor_id},
            headers={"x-internal-secret": settings.internal_secret},
        )
        resp.raise_for_status()
        return resp.json()


async def trigger_evaluation(
    submission_id: int, contest_id: int, tz_text: str, submission_text: str
) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.evaluation_service_url}/evaluation/evaluate",
                json={
                    "submission_id": submission_id,
                    "contest_id": contest_id,
                    "tz_text": tz_text,
                    "submission_text": submission_text,
                },
                headers={"x-internal-secret": settings.internal_secret},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None  # evaluation failure does not block submission


async def get_user(user_id: int) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.user_service_url}/users/{user_id}")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None
