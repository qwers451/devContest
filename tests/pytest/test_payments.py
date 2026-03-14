"""
Сценарии P1–P20: Платёжный сервис
Тестирует кошелёк, эскроу, оплату конкурсов и возвраты в stub-режиме
(YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не заданы).
"""

import datetime
import time

import httpx
import pytest
import pytz
from conftest import (
    CONTEST_URL,
    INTERNAL_SECRET,
    PAYMENT_URL,
    USER_URL,
    auth_headers,
)

TS = int(time.time())

internal_headers = {"x-internal-secret": INTERNAL_SECRET}


def future_date(days: int = 30) -> str:
    return (datetime.datetime.now(pytz.utc) + datetime.timedelta(days=days)).isoformat()


# ── P1. Кошелёк: баланс нового пользователя ──────────────────────────────────


@pytest.mark.asyncio
async def test_wallet_balance_initial(customer_token):
    """P1. Баланс кошелька существует и не отрицательный."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))
        assert r.status_code == 200
        data = r.json()
        assert "balance" in data
        assert data["balance"] >= 0
        assert data["currency"] == "RUB"


# ── P2. Кошелёк: пополнение через internal endpoint ──────────────────────────


@pytest.mark.asyncio
async def test_wallet_internal_credit(customer_token):
    """P2. Internal credit зачисляет средства на кошелёк."""
    # Получаем id текущего пользователя
    async with httpx.AsyncClient() as c:
        profile = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(customer_token))
        assert profile.status_code == 200
        user_id = profile.json()["id"]

        before = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))).json()["balance"]

        r = await c.post(
            f"{PAYMENT_URL}/wallet/internal/credit",
            json={"user_id": user_id, "amount": 500.0, "description": "Test credit P2"},
            headers=internal_headers,
        )
        assert r.status_code == 200

        after = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))).json()["balance"]
        assert after == pytest.approx(before + 500.0, abs=0.01)


# ── P3. Кошелёк: пополнение через stub-topup (без YooKassa) ──────────────────


@pytest.mark.asyncio
async def test_wallet_topup_stub(executor_token):
    """P3. POST /wallet/topup создаёт платёж; в stub-режиме сразу зачисляет средства."""
    async with httpx.AsyncClient() as c:
        before = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(executor_token))).json()["balance"]

        r = await c.post(
            f"{PAYMENT_URL}/wallet/topup",
            json={"amount": 1000.0},
            headers=auth_headers(executor_token),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["amount"] == pytest.approx(1000.0, abs=0.01)
        assert "payment_id" in data

        if data["redirect_url"] is None:
            # Stub mode: wallet credited immediately
            assert data["status"] == "held"
            after = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(executor_token))).json()["balance"]
            assert after == pytest.approx(before + 1000.0, abs=0.01)
        else:
            # YooKassa configured: payment pending, redirect returned
            assert data["status"] in ("pending", "held")
            assert data["redirect_url"].startswith("http")


# ── P4. Кошелёк: некорректная сумма пополнения ───────────────────────────────


@pytest.mark.asyncio
async def test_wallet_topup_invalid_amount(customer_token):
    """P4. Нулевая и отрицательная сумма пополнения → 400."""
    async with httpx.AsyncClient() as c:
        for bad in (0, -100):
            r = await c.post(
                f"{PAYMENT_URL}/wallet/topup",
                json={"amount": bad},
                headers=auth_headers(customer_token),
            )
            assert r.status_code == 400, f"Expected 400 for amount={bad}, got {r.status_code}"


# ── P5. Кошелёк: история транзакций ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_wallet_transactions_list(executor_token):
    """P5. GET /wallet/transactions возвращает список и содержит topup."""
    async with httpx.AsyncClient() as c:
        # Получаем user_id исполнителя
        profile = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(executor_token))
        assert profile.status_code == 200
        user_id = profile.json()["id"]

        # Используем internal/credit — всегда создаёт WalletTransaction независимо от режима YooKassa
        cr = await c.post(
            f"{PAYMENT_URL}/wallet/internal/credit",
            json={"user_id": user_id, "amount": 200.0, "description": "P5 setup"},
            headers=internal_headers,
        )
        assert cr.status_code == 200

        r = await c.get(f"{PAYMENT_URL}/wallet/transactions", headers=auth_headers(executor_token))
        assert r.status_code == 200
        txs = r.json()
        assert isinstance(txs, list)
        assert len(txs) > 0
        tx_types = {tx["tx_type"] for tx in txs}
        assert "topup" in tx_types


# ── P6. Кошелёк: вывод средств (stub) ────────────────────────────────────────


@pytest.mark.asyncio
async def test_wallet_withdraw_stub(executor_token):
    """P6. POST /wallet/withdraw списывает средства и создаёт payout."""
    async with httpx.AsyncClient() as c:
        profile = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(executor_token))
        user_id = profile.json()["id"]

        # Убедимся, что средств достаточно
        await c.post(
            f"{PAYMENT_URL}/wallet/internal/credit",
            json={"user_id": user_id, "amount": 2000.0, "description": "Setup for P6"},
            headers=internal_headers,
        )
        before = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(executor_token))).json()["balance"]

        r = await c.post(
            f"{PAYMENT_URL}/wallet/withdraw",
            json={"amount": 500.0},
            headers=auth_headers(executor_token),
        )
        assert r.status_code == 200
        payout = r.json()
        assert payout["amount"] == pytest.approx(500.0, abs=0.01)
        assert payout["status"] in ("released", "succeeded")

        after = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(executor_token))).json()["balance"]
        assert after == pytest.approx(before - 500.0, abs=0.01)


# ── P7. Кошелёк: вывод при недостаточном балансе ─────────────────────────────


@pytest.mark.asyncio
async def test_wallet_withdraw_insufficient(customer_token):
    """P7. Вывод суммы больше баланса → 400."""
    async with httpx.AsyncClient() as c:
        balance = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))).json()["balance"]
        r = await c.post(
            f"{PAYMENT_URL}/wallet/withdraw",
            json={"amount": balance + 999999.0},
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 400


# ── P8. Кошелёк: возврат пополнения ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_wallet_topup_refund(customer_token):
    """P8. POST /wallet/topup/{id}/refund возвращает средства и статус refunded.
    В режиме YooKassa топап остаётся pending до подтверждения пользователем — тест пропускается."""
    async with httpx.AsyncClient() as c:
        # Пополняем
        topup = await c.post(
            f"{PAYMENT_URL}/wallet/topup",
            json={"amount": 300.0},
            headers=auth_headers(customer_token),
        )
        assert topup.status_code == 200
        topup_data = topup.json()

        if topup_data.get("redirect_url") is not None:
            pytest.skip("YooKassa configured — wallet topup refund test requires stub mode")

        payment_id = topup_data["payment_id"]
        before = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))).json()["balance"]

        # Возвращаем
        r = await c.post(
            f"{PAYMENT_URL}/wallet/topup/{payment_id}/refund",
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "refunded"

        after = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))).json()["balance"]
        assert after == pytest.approx(before - 300.0, abs=0.01)


# ── P9. Кошелёк: повторный возврат одного пополнения ─────────────────────────


@pytest.mark.asyncio
async def test_wallet_topup_refund_duplicate(customer_token):
    """P9. Повторный возврат уже возвращённого платежа → 409.
    В режиме YooKassa топап остаётся pending — тест пропускается."""
    async with httpx.AsyncClient() as c:
        topup = await c.post(
            f"{PAYMENT_URL}/wallet/topup",
            json={"amount": 100.0},
            headers=auth_headers(customer_token),
        )
        assert topup.status_code == 200
        topup_data = topup.json()

        if topup_data.get("redirect_url") is not None:
            pytest.skip("YooKassa configured — duplicate refund test requires stub mode")

        payment_id = topup_data["payment_id"]

        await c.post(
            f"{PAYMENT_URL}/wallet/topup/{payment_id}/refund",
            headers=auth_headers(customer_token),
        )

        r = await c.post(
            f"{PAYMENT_URL}/wallet/topup/{payment_id}/refund",
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 409


# ── P10. Эскроу: резервирование ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_escrow_reserve(contest):
    """P10. Эскроу уже зарезервирован при создании конкурса через fixture."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{PAYMENT_URL}/escrow/status/{contest['id']}",
            headers=internal_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["held"] is True
        assert data["status"] == "held"


# ── P11. Эскроу: повторное резервирование → 409 ──────────────────────────────


@pytest.mark.asyncio
async def test_escrow_reserve_duplicate(contest):
    """P11. Повторное резервирование эскроу для того же конкурса → 409."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{PAYMENT_URL}/escrow/reserve",
            json={"contest_id": contest["id"], "customer_id": contest["customer_id"], "amount": 5000},
            headers=internal_headers,
        )
        assert r.status_code == 409


# ── P12. Оплата конкурса через баланс кошелька ───────────────────────────────


@pytest.mark.asyncio
async def test_payment_topup_from_balance(customer_token, contest_type_id, admin_token):
    """P12. Оплата конкурса через баланс кошелька (use_balance=True)."""
    async with httpx.AsyncClient() as c:
        profile = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(customer_token))
        user_id = profile.json()["id"]

        # Пополняем кошелёк
        await c.post(
            f"{PAYMENT_URL}/wallet/internal/credit",
            json={"user_id": user_id, "amount": 10000.0, "description": "Setup P12"},
            headers=internal_headers,
        )

        # Создаём конкурс (черновик)
        r = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": f"Payment Test {TS}",
                "annotation": "A" * 30,
                "description": "D" * 100,
                "tz_text": "TZ",
                "prizepool": 3000,
                "ends_at": future_date(),
                "type_id": contest_type_id,
                "stages": [],
            },
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 201
        new_contest = r.json()
        contest_id = new_contest["id"]

        before = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))).json()["balance"]

        # Оплачиваем через баланс
        pay = await c.post(
            f"{PAYMENT_URL}/payments/topup",
            json={"contest_id": contest_id, "amount": 3000, "use_balance": True},
            headers=auth_headers(customer_token),
        )
        assert pay.status_code == 200, pay.text
        pay_data = pay.json()
        assert pay_data["status"] == "held"

        after = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))).json()["balance"]
        assert after == pytest.approx(before - 3000.0, abs=0.01)

        # Cleanup
        await c.delete(f"{CONTEST_URL}/contests/{contest_id}", headers=auth_headers(admin_token))


# ── P13. Статус оплаты конкурса ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_payment_status(contest, customer_token):
    """P13. GET /payments/{contest_id} возвращает статус held для оплаченного конкурса."""
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{PAYMENT_URL}/payments/{contest['id']}",
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "held"
        assert data["amount"] == pytest.approx(contest["prizepool"], abs=0.01)


# ── P14. Возврат оплаты конкурса ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_payment_refund(customer_token, contest_type_id, admin_token):
    """P14. POST /payments/{contest_id}/refund возвращает платёж и отменяет конкурс."""
    async with httpx.AsyncClient() as c:
        profile = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(customer_token))
        user_id = profile.json()["id"]

        # Обеспечиваем баланс
        await c.post(
            f"{PAYMENT_URL}/wallet/internal/credit",
            json={"user_id": user_id, "amount": 8000.0, "description": "Setup P14"},
            headers=internal_headers,
        )

        # Создаём и оплачиваем конкурс
        cr = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": f"Refund Test {TS}",
                "annotation": "A" * 30,
                "description": "D" * 100,
                "tz_text": "TZ",
                "prizepool": 2000,
                "ends_at": future_date(),
                "type_id": contest_type_id,
                "stages": [],
            },
            headers=auth_headers(customer_token),
        )
        assert cr.status_code == 201
        contest_id = cr.json()["id"]
        cust_id = cr.json()["customer_id"]

        # Резервируем эскроу и активируем
        await c.post(
            f"{PAYMENT_URL}/escrow/reserve",
            json={"contest_id": contest_id, "customer_id": cust_id, "amount": 2000},
            headers=internal_headers,
        )
        await c.patch(
            f"{CONTEST_URL}/contests/{contest_id}/activate-internal",
            headers=internal_headers,
        )

        before = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(customer_token))).json()["balance"]

        # Возврат
        r = await c.post(
            f"{PAYMENT_URL}/payments/{contest_id}/refund",
            headers=auth_headers(customer_token),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "refunded"

        # Конкурс должен стать cancelled
        cr2 = await c.get(f"{CONTEST_URL}/contests/{contest_id}")
        assert cr2.json()["status"] == "cancelled"

        # Cleanup
        await c.delete(f"{CONTEST_URL}/contests/{contest_id}", headers=auth_headers(admin_token))


# ── P15. Возврат чужого платежа → 403 ────────────────────────────────────────


@pytest.mark.asyncio
async def test_payment_refund_forbidden(contest, executor_token):
    """P15. Возврат платежа другого пользователя → 403."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{PAYMENT_URL}/payments/{contest['id']}/refund",
            headers=auth_headers(executor_token),
        )
        assert r.status_code == 403


# ── P16. Эскроу: выплата победителю ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_escrow_release_credits_wallet(contest, executor_token, submission):
    """P16. POST /escrow/release зачисляет приз на кошелёк исполнителя."""
    async with httpx.AsyncClient() as c:
        profile = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(executor_token))
        executor_id = profile.json()["id"]

        before = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(executor_token))).json()["balance"]

        r = await c.post(
            f"{PAYMENT_URL}/escrow/release",
            json={"contest_id": contest["id"], "executor_id": executor_id},
            headers=internal_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "released"
        assert data["amount"] == pytest.approx(contest["prizepool"], abs=0.01)

        after = (await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(executor_token))).json()["balance"]
        assert after == pytest.approx(before + contest["prizepool"], abs=0.01)


# ── P17. Эскроу: повторная выплата → 409 ─────────────────────────────────────


@pytest.mark.asyncio
async def test_escrow_release_duplicate(contest, executor_token):
    """P17. Повторная выплата по уже выплаченному эскроу → 409."""
    async with httpx.AsyncClient() as c:
        profile = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(executor_token))
        executor_id = profile.json()["id"]

        r = await c.post(
            f"{PAYMENT_URL}/escrow/release",
            json={"contest_id": contest["id"], "executor_id": executor_id},
            headers=internal_headers,
        )
        assert r.status_code == 409


# ── P18. Кошелёк: недоступен без авторизации ─────────────────────────────────


@pytest.mark.asyncio
async def test_wallet_requires_auth():
    """P18. Запросы к кошельку без токена → 401 или 403."""
    async with httpx.AsyncClient() as c:
        for path in ("/wallet/balance", "/wallet/transactions"):
            r = await c.get(f"{PAYMENT_URL}{path}")
            assert r.status_code in (401, 403), f"Expected 401/403 for {path}, got {r.status_code}"


# ── P19. История платежей конкурсов ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_payment_history(customer_token, contest):
    """P19. GET /payments/history содержит запись об оплаченном конкурсе."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{PAYMENT_URL}/payments/history", headers=auth_headers(customer_token))
        assert r.status_code == 200
        history = r.json()
        assert isinstance(history, list)
        contest_ids = [p["contest_id"] for p in history]
        assert contest["id"] in contest_ids


# ── P20. Internal credit: неверный секрет → 403 ──────────────────────────────


@pytest.mark.asyncio
async def test_internal_credit_wrong_secret(customer_token):
    """P20. Internal endpoint с неверным секретом → 403."""
    async with httpx.AsyncClient() as c:
        profile = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(customer_token))
        user_id = profile.json()["id"]

        r = await c.post(
            f"{PAYMENT_URL}/wallet/internal/credit",
            json={"user_id": user_id, "amount": 100.0, "description": "hack"},
            headers={"x-internal-secret": "wrong_secret"},
        )
        assert r.status_code == 403
