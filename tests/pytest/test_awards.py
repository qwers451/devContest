"""
Задача 3: комиссия платформы 10% и несколько призовых мест.
Тесты идут против живого стека (contest-service + payment-service).
"""

import datetime
from uuid import uuid4

import httpx
import pytest
import pytz
from conftest import (
    CONTEST_URL,
    INTERNAL_SECRET,
    PAYMENT_URL,
    USER_URL,
    auth_headers,
    register_user,
)

INTERNAL = {"x-internal-secret": INTERNAL_SECRET}
PRIZEPOOL = 10000


def _iso(days: float = 30) -> str:
    return (
        datetime.datetime.now(pytz.utc) + datetime.timedelta(days=days)
    ).isoformat()


async def _profile(token: str) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{USER_URL}/users/profile", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()


async def _balance(token: str) -> float:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{PAYMENT_URL}/wallet/balance", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()["balance"]


async def _commission_total(admin_token: str) -> float:
    async with httpx.AsyncClient() as c:
        r = await c.get(
            f"{PAYMENT_URL}/payments/statistics", headers=auth_headers(admin_token)
        )
    assert r.status_code == 200, r.text
    items = {i["label"]: i["value"] for i in r.json()["summary"]}
    assert "Комиссия платформы" in items
    return items["Комиссия платформы"]


async def _escrow(contest_id: int) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{PAYMENT_URL}/escrow/status/{contest_id}", headers=INTERNAL)
    assert r.status_code == 200, r.text
    return r.json()


async def _make_contest(
    customer_token: str,
    type_id: int,
    *,
    distribution: list[int] | None = None,
    paid: bool = True,
    prizepool: int = PRIZEPOOL,
) -> dict:
    body = {
        "title": f"Awards {uuid4().hex[:8]}",
        "annotation": "A" * 30,
        "description": "D" * 100,
        "tz_text": "TZ",
        "prizepool": prizepool,
        "ends_at": _iso(),
        "type_id": type_id,
        "stages": [],
    }
    if distribution is not None:
        body["prize_distribution"] = distribution
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contests", json=body, headers=auth_headers(customer_token)
        )
        assert r.status_code == 201, r.text
        data = r.json()
        if paid:
            res = await c.post(
                f"{PAYMENT_URL}/escrow/reserve",
                json={
                    "contest_id": data["id"],
                    "customer_id": data["customer_id"],
                    "amount": data["prizepool"],
                },
                headers=INTERNAL,
            )
            assert res.status_code == 200, res.text
        act = await c.patch(
            f"{CONTEST_URL}/contests/{data['id']}/activate-internal", headers=INTERNAL
        )
        assert act.status_code == 200, act.text
    return data


async def _submit(token: str, contest_id: int) -> dict:
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/submissions",
            json={
                "contest_id": contest_id,
                "title": f"Sol {uuid4().hex[:6]}",
                "annotation": "A" * 30,
                "description": "D" * 100,
            },
            headers=auth_headers(token),
        )
    assert r.status_code == 201, r.text
    return r.json()


async def _post_awards(token: str, contest_id: int, awards: list[tuple[int, int]]):
    async with httpx.AsyncClient() as c:
        return await c.post(
            f"{CONTEST_URL}/contests/{contest_id}/awards",
            json={"awards": [{"submission_id": s, "place": p} for s, p in awards]},
            headers=auth_headers(token),
        )


async def _executors(n: int):
    """n исполнителей: [(token, user_id)]."""
    out = []
    for _ in range(n):
        token = await register_user("executor")
        out.append((token, (await _profile(token))["id"]))
    return out


@pytest.fixture
async def cleanup(admin_token):
    ids: list[int] = []
    yield ids
    async with httpx.AsyncClient() as c:
        for cid in ids:
            await c.delete(
                f"{CONTEST_URL}/contests/{cid}", headers=auth_headers(admin_token)
            )


# ── Комиссия: публичный процент ──────────────────────────────────────────────


async def test_commission_percent_is_public():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{PAYMENT_URL}/payments/commission")
    assert r.status_code == 200, r.text
    assert r.json() == {"percent": 10}


# ── Несколько призовых мест [60, 30, 10] ─────────────────────────────────────


async def test_awards_split_with_commission(
    admin_token, customer_token, contest_type_id, cleanup
):
    contest = await _make_contest(
        customer_token, contest_type_id, distribution=[60, 30, 10]
    )
    cleanup.append(contest["id"])
    assert contest["prize_distribution"] == [60, 30, 10]

    (t1, id1), (t2, id2), (t3, id3), (t4, _) = await _executors(4)
    s1, s2, s3, s4 = [
        await _submit(t, contest["id"]) for t in (t1, t2, t3, t4)
    ]
    before = [await _balance(t) for t in (t1, t2, t3, t4)]
    commission_before = await _commission_total(admin_token)

    r = await _post_awards(
        customer_token,
        contest["id"],
        [(s1["id"], 1), (s2["id"], 2), (s3["id"], 3)],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "finished"
    assert body["winner"]["submission_id"] == s1["id"]
    assert [(a["place"], a["amount"], a["net_amount"]) for a in body["awards"]] == [
        (1, 6000.0, 5400.0),
        (2, 3000.0, 2700.0),
        (3, 1000.0, 900.0),
    ]

    # Кошельки: 90% от долей 60/30/10
    assert await _balance(t1) == pytest.approx(before[0] + 5400, abs=0.01)
    assert await _balance(t2) == pytest.approx(before[1] + 2700, abs=0.01)
    assert await _balance(t3) == pytest.approx(before[2] + 900, abs=0.01)
    assert await _balance(t4) == pytest.approx(before[3], abs=0.01)

    # Эскроу выплачен полностью, комиссия 10% от призового фонда видна в статистике
    escrow = await _escrow(contest["id"])
    assert escrow["status"] == "released"
    assert escrow["released_amount"] == pytest.approx(PRIZEPOOL, abs=0.01)
    assert await _commission_total(admin_token) == pytest.approx(
        commission_before + 1000, abs=0.01
    )

    # Только 1 место получает статус «победитель»
    async with httpx.AsyncClient() as c:
        listed = await c.get(
            f"{CONTEST_URL}/submissions",
            params={"contest_id": contest["id"]},
            headers=auth_headers(customer_token),
        )
        assert listed.status_code == 200, listed.text
        payload = listed.json()
        subs = {
            s["id"]: s["status"]
            for s in (payload["items"] if isinstance(payload, dict) else payload)
        }
        assert subs[s1["id"]] == 3
        assert subs[s2["id"]] != 3 and subs[s3["id"]] != 3

        # Публичный список призёров
        listing = await c.get(f"{CONTEST_URL}/contests/{contest['id']}/awards")
    assert listing.status_code == 200
    rows = listing.json()
    assert [row["place"] for row in rows] == [1, 2, 3]
    assert rows[0]["submission_id"] == s1["id"]
    assert rows[0]["submission_number"] == s1["number"]
    assert rows[0]["executor_id"] == id1
    assert rows[0]["executor_login"]
    assert rows[1]["amount"] == 3000.0 and rows[1]["net_amount"] == 2700.0
    assert rows[2]["commission"] == 100.0


async def test_wallet_description_mentions_net_and_commission(
    customer_token, contest_type_id, cleanup
):
    contest = await _make_contest(customer_token, contest_type_id)
    cleanup.append(contest["id"])
    ((t1, _),) = await _executors(1)
    s1 = await _submit(t1, contest["id"])
    r = await _post_awards(customer_token, contest["id"], [(s1["id"], 1)])
    assert r.status_code == 200, r.text
    async with httpx.AsyncClient() as c:
        txs = await c.get(
            f"{PAYMENT_URL}/wallet/transactions", headers=auth_headers(t1)
        )
    assert txs.status_code == 200, txs.text
    data = txs.json()
    items = data["items"] if isinstance(data, dict) else data
    descriptions = [t["description"] for t in items]
    assert any(
        "9 000" in d and "комиссия платформы 10%" in d and "1 000" in d
        for d in descriptions
    ), descriptions


async def test_awards_remainder_goes_to_last_place(
    admin_token, customer_token, contest_type_id, cleanup
):
    """Нечётный фонд: суммы по местам в сумме дают ровно фонд."""
    contest = await _make_contest(
        customer_token, contest_type_id, distribution=[33, 33, 34], prizepool=1001
    )
    cleanup.append(contest["id"])
    execs = await _executors(3)
    subs = [await _submit(t, contest["id"]) for t, _ in execs]
    r = await _post_awards(
        customer_token, contest["id"], [(s["id"], i + 1) for i, s in enumerate(subs)]
    )
    assert r.status_code == 200, r.text
    amounts = [a["amount"] for a in r.json()["awards"]]
    assert sum(amounts) == pytest.approx(1001, abs=0.001)
    escrow = await _escrow(contest["id"])
    assert escrow["released_amount"] == pytest.approx(1001, abs=0.001)
    assert escrow["status"] == "released"


async def test_awards_unpaid_contest_records_without_payout(
    customer_token, contest_type_id, cleanup
):
    contest = await _make_contest(
        customer_token, contest_type_id, distribution=[70, 30], paid=False
    )
    cleanup.append(contest["id"])
    (t1, _), (t2, _) = await _executors(2)
    s1, s2 = await _submit(t1, contest["id"]), await _submit(t2, contest["id"])
    b1 = await _balance(t1)
    r = await _post_awards(
        customer_token, contest["id"], [(s1["id"], 1), (s2["id"], 2)]
    )
    assert r.status_code == 200, r.text
    assert [a["amount"] for a in r.json()["awards"]] == [7000.0, 3000.0]
    assert await _balance(t1) == pytest.approx(b1, abs=0.01)


# ── Старый /winner ───────────────────────────────────────────────────────────


async def test_legacy_winner_gets_90_percent(
    admin_token, customer_token, contest_type_id, cleanup
):
    contest = await _make_contest(customer_token, contest_type_id)
    cleanup.append(contest["id"])
    ((t1, id1),) = await _executors(1)
    s1 = await _submit(t1, contest["id"])
    before = await _balance(t1)
    commission_before = await _commission_total(admin_token)

    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contests/{contest['id']}/winner",
            params={"submission_id": s1["id"], "executor_id": id1},
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 200, r.text
    assert await _balance(t1) == pytest.approx(before + PRIZEPOOL * 0.9, abs=0.01)
    assert await _commission_total(admin_token) == pytest.approx(
        commission_before + PRIZEPOOL * 0.1, abs=0.01
    )
    async with httpx.AsyncClient() as c:
        rows = (await c.get(f"{CONTEST_URL}/contests/{contest['id']}/awards")).json()
    assert [(a["place"], a["amount"], a["net_amount"]) for a in rows] == [
        (1, 10000.0, 9000.0)
    ]


# ── Валидация ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "bad",
    [[60, 30], [50, 50, 10], [], [20] * 6, [100, 0], [110, -10]],
)
async def test_distribution_validation_on_create(customer_token, contest_type_id, bad):
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{CONTEST_URL}/contests",
            json={
                "title": "Bad distribution",
                "annotation": "A" * 30,
                "description": "D" * 100,
                "tz_text": "TZ",
                "prizepool": 1000,
                "ends_at": _iso(),
                "type_id": contest_type_id,
                "prize_distribution": bad,
            },
            headers=auth_headers(customer_token),
        )
    assert r.status_code == 422, r.text
    assert "Value error" in r.text and (
        "Призовых мест" in r.text or "Сумма долей" in r.text or "Доля" in r.text
    )


async def test_distribution_update_and_default(
    customer_token, contest_type_id, cleanup
):
    contest = await _make_contest(customer_token, contest_type_id, paid=False)
    cleanup.append(contest["id"])
    assert contest["prize_distribution"] == [100]
    async with httpx.AsyncClient() as c:
        bad = await c.put(
            f"{CONTEST_URL}/contests/{contest['id']}",
            json={"prize_distribution": [90, 5]},
            headers=auth_headers(customer_token),
        )
        assert bad.status_code == 422
        ok = await c.put(
            f"{CONTEST_URL}/contests/{contest['id']}",
            json={"prize_distribution": [50, 30, 20]},
            headers=auth_headers(customer_token),
        )
    assert ok.status_code == 200, ok.text
    assert ok.json()["prize_distribution"] == [50, 30, 20]


async def test_awards_input_validation(customer_token, contest_type_id, cleanup):
    contest = await _make_contest(
        customer_token, contest_type_id, distribution=[60, 40]
    )
    cleanup.append(contest["id"])
    (t1, _), (t2, _) = await _executors(2)
    s1, s2 = await _submit(t1, contest["id"]), await _submit(t2, contest["id"])
    cid = contest["id"]

    # дубль места
    r = await _post_awards(customer_token, cid, [(s1["id"], 1), (s2["id"], 1)])
    assert r.status_code == 422, r.text
    # одно решение на два места
    r = await _post_awards(customer_token, cid, [(s1["id"], 1), (s1["id"], 2)])
    assert r.status_code == 422, r.text
    # нет 1 места
    r = await _post_awards(customer_token, cid, [(s2["id"], 2)])
    assert r.status_code == 422, r.text
    # место вне распределения
    r = await _post_awards(customer_token, cid, [(s1["id"], 1), (s2["id"], 3)])
    assert r.status_code == 422, r.text
    # после всех отказов конкурс остался активным и деньги не тронуты
    escrow = await _escrow(cid)
    assert escrow["status"] == "held" and escrow["released_amount"] == 0


async def test_awards_foreign_submission_rejected(
    customer_token, contest_type_id, cleanup
):
    contest = await _make_contest(customer_token, contest_type_id)
    other = await _make_contest(customer_token, contest_type_id, paid=False)
    cleanup.extend([contest["id"], other["id"]])
    ((t1, _),) = await _executors(1)
    foreign = await _submit(t1, other["id"])
    r = await _post_awards(customer_token, contest["id"], [(foreign["id"], 1)])
    assert r.status_code in (400, 404), r.text
    assert (await _escrow(contest["id"]))["released_amount"] == 0


async def test_awards_forbidden_for_non_owner_and_executor(
    customer_token, outsider_token, contest_type_id, cleanup
):
    contest = await _make_contest(customer_token, contest_type_id)
    cleanup.append(contest["id"])
    ((t1, _),) = await _executors(1)
    s1 = await _submit(t1, contest["id"])
    r = await _post_awards(outsider_token, contest["id"], [(s1["id"], 1)])
    assert r.status_code == 403, r.text
    r = await _post_awards(t1, contest["id"], [(s1["id"], 1)])
    assert r.status_code == 403, r.text
    assert (await _escrow(contest["id"]))["released_amount"] == 0


async def test_awards_twice_conflict_and_no_double_payout(
    customer_token, contest_type_id, cleanup
):
    contest = await _make_contest(customer_token, contest_type_id)
    cleanup.append(contest["id"])
    ((t1, _),) = await _executors(1)
    s1 = await _submit(t1, contest["id"])
    first = await _post_awards(customer_token, contest["id"], [(s1["id"], 1)])
    assert first.status_code == 200, first.text
    balance = await _balance(t1)
    second = await _post_awards(customer_token, contest["id"], [(s1["id"], 1)])
    assert second.status_code == 409, second.text
    assert await _balance(t1) == pytest.approx(balance, abs=0.01)


async def test_release_award_is_idempotent_per_place(
    customer_token, contest_type_id, cleanup
):
    """Внутренний эндпоинт: повтор по тому же месту не платит дважды."""
    contest = await _make_contest(
        customer_token, contest_type_id, distribution=[50, 50]
    )
    cleanup.append(contest["id"])
    ((t1, id1),) = await _executors(1)
    payload = {
        "contest_id": contest["id"],
        "place": 1,
        "executor_id": id1,
        "amount": 5000,
    }
    before = await _balance(t1)
    async with httpx.AsyncClient() as c:
        a = await c.post(f"{PAYMENT_URL}/escrow/release-award", json=payload, headers=INTERNAL)
        b = await c.post(f"{PAYMENT_URL}/escrow/release-award", json=payload, headers=INTERNAL)
        over = await c.post(
            f"{PAYMENT_URL}/escrow/release-award",
            json={**payload, "place": 2, "amount": 6000},
            headers=INTERNAL,
        )
        nosecret = await c.post(f"{PAYMENT_URL}/escrow/release-award", json=payload)
    assert a.status_code == 200 and a.json()["net_amount"] == 4500
    assert b.status_code == 200 and b.json()["status"] == "already_released"
    assert over.status_code == 400  # больше остатка эскроу
    assert nosecret.status_code == 403
    assert await _balance(t1) == pytest.approx(before + 4500, abs=0.01)
