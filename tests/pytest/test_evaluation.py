"""
Сценарии E1–E12: Сервис оценки (evaluation-service)
Тестирует извлечение требований из ТЗ, оценку решений и статистику.
Работает как в stub-режиме (EVALUATION_STUB=true), так и с реальной моделью.
"""

import httpx
import pytest
from conftest import CONTEST_URL, EVAL_URL, INTERNAL_SECRET, auth_headers

internal_headers = {"x-internal-secret": INTERNAL_SECRET}


# ── E1. Неавторизованный запрос ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_eval_unauthorized():
    """E1. Без токена evaluation отдаёт 401/403."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{EVAL_URL}/evaluation/999")
    assert r.status_code in (401, 403)


# ── E2. Оценка несуществующего решения → 404 ───────────────────────────────────


@pytest.mark.asyncio
async def test_get_evaluation_not_found(customer_token):
    """E2. GET /evaluation/{id} для несуществующего решения возвращает 404."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{EVAL_URL}/evaluation/999999",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 404


# ── E3. POST /evaluate (internal) — stub-режим ────────────────────────────────


@pytest.mark.asyncio
async def test_evaluate_stub(contest, submission):
    """E3. POST /evaluate через internal secret возвращает результат оценки."""
    async with httpx.AsyncClient(timeout=120.0) as c:
        r = await c.post(
            f"{EVAL_URL}/evaluation/evaluate",
            json={
                "submission_id": submission["id"],
                "contest_id": contest["id"],
                "tz_text": contest.get("tz_text", "Техническое задание для теста"),
                "submission_text": submission.get("description", "Описание решения"),
                "images": [],
                "image_meta": [],
            },
            headers=internal_headers,
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "compliance_score" in data
    assert isinstance(data["compliance_score"], int)
    assert 0 <= data["compliance_score"] <= 100
    assert "passed_requirements" in data
    assert "failed_requirements" in data
    assert "critical_issues" in data
    assert isinstance(data["critical_issues"], bool)


# ── E4. GET /evaluation/{submission_id} — результат сохранён ─────────────────


@pytest.mark.asyncio
async def test_get_evaluation_after_evaluate(customer_token, contest, submission):
    """E4. После оценки GET /evaluation/{id} возвращает сохранённый результат."""
    async with httpx.AsyncClient(timeout=120.0) as c:
        # Убедимся что оценка существует (evaluate мог уже запуститься в E3)
        await c.post(
            f"{EVAL_URL}/evaluation/evaluate",
            json={
                "submission_id": submission["id"],
                "contest_id": contest["id"],
                "tz_text": contest.get("tz_text", "ТЗ"),
                "submission_text": submission.get("description", "Решение"),
                "images": [],
                "image_meta": [],
            },
            headers=internal_headers,
        )
        r = await c.get(
            f"{EVAL_URL}/evaluation/{submission['id']}",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert data["submission_id"] == submission["id"]
    assert data["contest_id"] == contest["id"]
    assert "compliance_score" in data
    assert "requirements_detail" in data
    assert isinstance(data["requirements_detail"], list)


# ── E5. requirements_detail содержит правильные поля ─────────────────────────


@pytest.mark.asyncio
async def test_evaluation_requirements_detail(customer_token, submission):
    """E5. requirements_detail содержит text, score, comment, is_critical."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{EVAL_URL}/evaluation/{submission['id']}",
            headers=auth_headers(customer_token),
        )
    if r.status_code == 404:
        pytest.skip("Оценка ещё не создана — запустите E3 первым")
    assert r.status_code == 200
    data = r.json()
    for req in data.get("requirements_detail", []):
        assert "text" in req
        assert "score" in req
        assert "comment" in req
        assert "is_critical" in req
        assert req["score"] in (0, 50, 100)


# ── E6. POST /evaluate без internal secret → 403 ─────────────────────────────


@pytest.mark.asyncio
async def test_evaluate_without_internal_secret(customer_token, contest, submission):
    """E6. POST /evaluate без internal secret возвращает 403."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{EVAL_URL}/evaluation/evaluate",
            json={
                "submission_id": submission["id"],
                "contest_id": contest["id"],
                "tz_text": "ТЗ",
                "submission_text": "Решение",
            },
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 403


# ── E7. Извлечение требований из ТЗ (stub) ────────────────────────────────────


@pytest.mark.asyncio
async def test_extract_requirements_stub(customer_token, contest):
    """E7. POST /evaluation/requirements/{contest_id} возвращает список требований."""
    async with httpx.AsyncClient(timeout=120.0) as c:
        r = await c.post(
            f"{EVAL_URL}/evaluation/requirements/{contest['id']}",
            json={"tz_text": "Нужен сайт с авторизацией и формой обратной связи."},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["contest_id"] == contest["id"]
    assert "requirements" in data
    assert isinstance(data["requirements"], list)
    assert len(data["requirements"]) > 0
    for req in data["requirements"]:
        assert "text" in req
        assert "is_critical" in req


# ── E8. GET /evaluation/requirements/{contest_id} — кэш ──────────────────────


@pytest.mark.asyncio
async def test_get_cached_requirements(customer_token, contest):
    """E8. GET /evaluation/requirements/{contest_id} возвращает закэшированные требования."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{EVAL_URL}/evaluation/requirements/{contest['id']}",
            headers=auth_headers(customer_token),
        )
    # Может быть 404 если E7 не запускался, или 200 если запускался
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        data = r.json()
        assert "requirements" in data
        assert "cached_at" in data


# ── E9. GET /evaluation/requirements/{contest_id} — нет кэша → 404 ───────────


@pytest.mark.asyncio
async def test_get_requirements_not_cached(customer_token):
    """E9. GET requirements для конкурса без ТЗ возвращает 404."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{EVAL_URL}/evaluation/requirements/999999",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 404


# ── E10. Статистика конкурса — нет оценок ─────────────────────────────────────


@pytest.mark.asyncio
async def test_contest_stats_empty(customer_token):
    """E10. Статистика для конкурса без оценок возвращает нули."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{EVAL_URL}/evaluation/contest/999999/stats",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert data["evaluated_count"] == 0
    assert data["avg_score"] is None
    assert data["critical_issues_count"] == 0


# ── E11. Статистика конкурса — после оценки ───────────────────────────────────


@pytest.mark.asyncio
async def test_contest_stats_after_evaluation(customer_token, contest, submission):
    """E11. Статистика конкурса обновляется после оценки."""
    async with httpx.AsyncClient(timeout=120.0) as c:
        # Убедимся что оценка есть
        await c.post(
            f"{EVAL_URL}/evaluation/evaluate",
            json={
                "submission_id": submission["id"],
                "contest_id": contest["id"],
                "tz_text": "ТЗ",
                "submission_text": "Решение",
                "images": [],
                "image_meta": [],
            },
            headers=internal_headers,
        )
        r = await c.get(
            f"{EVAL_URL}/evaluation/contest/{contest['id']}/stats",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    data = r.json()
    assert data["contest_id"] == contest["id"]
    assert data["evaluated_count"] >= 1
    assert data["avg_score"] is not None
    assert 0 <= data["avg_score"] <= 100


# ── E12. Повторная оценка обновляет результат ─────────────────────────────────


@pytest.mark.asyncio
async def test_reevaluate_updates_result(customer_token, contest, submission):
    """E12. Повторный POST /evaluate обновляет существующий результат."""
    async with httpx.AsyncClient(timeout=120.0) as c:
        r1 = await c.post(
            f"{EVAL_URL}/evaluation/evaluate",
            json={
                "submission_id": submission["id"],
                "contest_id": contest["id"],
                "tz_text": "Требования к проекту",
                "submission_text": "Первая версия решения",
                "images": [],
                "image_meta": [],
            },
            headers=internal_headers,
        )
        assert r1.status_code == 200

        r2 = await c.post(
            f"{EVAL_URL}/evaluation/evaluate",
            json={
                "submission_id": submission["id"],
                "contest_id": contest["id"],
                "tz_text": "Требования к проекту",
                "submission_text": "Вторая версия решения — улучшенная",
                "images": [],
                "image_meta": [],
            },
            headers=internal_headers,
        )
        assert r2.status_code == 200

        # Проверяем что запись одна (обновилась, не дублировалась)
        r = await c.get(
            f"{EVAL_URL}/evaluation/{submission['id']}",
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200
    assert r.json()["submission_id"] == submission["id"]
