import io
import json
import zipfile
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_snapshot import (
    UPLOADS_DIR,
    clear_uploads_dir,
    export_snapshot,
    import_snapshot,
)
from app.config import settings
from app.database import get_db
from app.dependencies import require_role

router = APIRouter(prefix="/import-export", tags=["import-export"])


def _internal_headers() -> dict[str, str]:
    return {"x-internal-secret": settings.internal_secret}


async def _fetch_service_snapshot(url: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=_internal_headers())
        response.raise_for_status()
        return response.json()


async def _restore_service_snapshot(url: str, payload: dict) -> None:
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=_internal_headers(), json=payload)
        response.raise_for_status()


def _add_uploads_to_zip(zip_file: zipfile.ZipFile) -> None:
    if not UPLOADS_DIR.exists():
        return
    for path in UPLOADS_DIR.rglob("*"):
        if path.is_file():
            zip_file.write(path, arcname=f"uploads/{path.relative_to(UPLOADS_DIR)}")


def _restore_uploads_from_zip(zip_file: zipfile.ZipFile) -> None:
    clear_uploads_dir()
    for member in zip_file.namelist():
        if not member.startswith("uploads/") or member.endswith("/"):
            continue
        relative_path = Path(member.removeprefix("uploads/"))
        if ".." in relative_path.parts:
            continue
        destination = UPLOADS_DIR / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        with zip_file.open(member) as source, destination.open("wb") as target:
            target.write(source.read())


@router.get("/export")
async def export_database_bundle(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    snapshot = {
        "meta": {"version": 1},
        "services": {
            "contest": await export_snapshot(db),
            "user": await _fetch_service_snapshot(
                f"{settings.user_service_url}/internal/admin/export"
            ),
            "payment": await _fetch_service_snapshot(
                f"{settings.payment_service_url}/internal/admin/export"
            ),
            "evaluation": await _fetch_service_snapshot(
                f"{settings.evaluation_service_url}/internal/admin/export"
            ),
        },
    }

    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr(
            "snapshot.json",
            json.dumps(snapshot, ensure_ascii=False, indent=2).encode("utf-8"),
        )
        _add_uploads_to_zip(zip_file)

    archive_buffer.seek(0)
    return StreamingResponse(
        archive_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="devcontest-backup.zip"'},
    )


@router.post("/import")
async def import_database_bundle(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_role("admin")),
):
    content = await file.read()
    archive_buffer = io.BytesIO(content)

    try:
        with zipfile.ZipFile(archive_buffer) as zip_file:
            if "snapshot.json" not in zip_file.namelist():
                raise HTTPException(status_code=400, detail="snapshot.json not found")

            payload = json.loads(zip_file.read("snapshot.json").decode("utf-8"))
            services = payload.get("services") or {}

            if (
                "user" not in services
                or "payment" not in services
                or "evaluation" not in services
                or "contest" not in services
            ):
                raise HTTPException(status_code=400, detail="Invalid backup format")

            await _restore_service_snapshot(
                f"{settings.user_service_url}/internal/admin/import",
                services["user"],
            )
            await _restore_service_snapshot(
                f"{settings.payment_service_url}/internal/admin/import",
                services["payment"],
            )
            await _restore_service_snapshot(
                f"{settings.evaluation_service_url}/internal/admin/import",
                services["evaluation"],
            )
            await import_snapshot(db, services["contest"]["tables"])
            _restore_uploads_from_zip(zip_file)
    except zipfile.BadZipFile as error:
        raise HTTPException(status_code=400, detail="Invalid archive file") from error
    except httpx.HTTPStatusError as error:
        detail = error.response.text.strip() or str(error)
        raise HTTPException(
            status_code=502,
            detail=f"Import failed in internal service: {detail}",
        ) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return {"status": "ok"}
