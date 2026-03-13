#!/usr/bin/env python3
"""Seed script: creates test users, contest types, contests, and submissions."""

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

USER_API    = os.getenv("SEED_USER_URL",    "http://localhost:8001")
CONTEST_API = os.getenv("SEED_CONTEST_URL", "http://localhost:8002")
PAYMENT_API = os.getenv("SEED_PAYMENT_URL", "http://localhost:8004")


def request(method, url, data=None, token=None):
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode())
        except Exception:
            err_body = {"detail": e.reason}
        return e.code, err_body


def post(url, data, token=None):
    return request("POST", url, data, token)


def get(url, token=None):
    return request("GET", url, token=token)


def patch(url, data=None, token=None):
    return request("PATCH", url, data, token)


def register_or_login(email, login, password, role):
    """Try login first; if it fails — register. Safe to re-run."""
    status, resp = post(
        f"{USER_API}/auth/login", {"login": login, "password": password}
    )
    if status == 200:
        return resp
    status, resp = post(
        f"{USER_API}/auth/register",
        {"email": email, "login": login, "password": password, "role": role},
    )
    if status == 201:
        return resp
    print(f"    login+register failed for {login}: {resp}")
    return None


def activate_contest(contest_id, amount, token):
    """Initiate payment (stub mode auto-activates the contest)."""
    status, resp = post(
        f"{PAYMENT_API}/payments/topup",
        {"contest_id": contest_id, "amount": amount},
        token,
    )
    if status in (200, 201):
        # Give stub a moment to call activate-internal on contest-service
        time.sleep(0.5)
        return True
    # Already paid / already active
    if status == 409:
        return True
    print(f"    topup failed for contest {contest_id}: {status} {resp}")
    return False


def get_wallet_balance(token):
    """Return current wallet balance (float), or None on error."""
    status, resp = get(f"{PAYMENT_API}/wallet/balance", token)
    if status == 200:
        return resp.get("balance", 0)
    return None


def topup_wallet(amount, token, label):
    """Top up user wallet via stub (auto-credits in dev mode)."""
    balance_before = get_wallet_balance(token)
    # Skip if already has enough balance (idempotency for re-runs)
    if balance_before is not None and balance_before >= amount:
        print(f"    {label} wallet → already {balance_before} ₽, skipping")
        return True
    status, resp = post(f"{PAYMENT_API}/wallet/topup", {"amount": amount}, token)
    if status in (200, 201):
        time.sleep(0.3)
        return True
    print(f"    wallet topup failed for {label}: {status} {resp}")
    return False


# ── Users ─────────────────────────────────────────────────────────────────────

print("=== Creating users ===")

admin_resp = register_or_login("admin@devcontest.ru", "admin", "admin123", "admin")
admin_token = admin_resp["access_token"] if admin_resp else None
print(f"  admin     → {'OK id=' + str(admin_resp['user']['id']) if admin_resp else 'FAIL'}")

customer_resp = register_or_login("customer@devcontest.ru", "customer1", "test1234", "customer")
customer_token = customer_resp["access_token"] if customer_resp else None
print(f"  customer1 → {'OK id=' + str(customer_resp['user']['id']) if customer_resp else 'FAIL'}")

executor_resp = register_or_login("executor@devcontest.ru", "executor1", "test1234", "executor")
executor_token = executor_resp["access_token"] if executor_resp else None
print(f"  executor1 → {'OK id=' + str(executor_resp['user']['id']) if executor_resp else 'FAIL'}")

executor2_resp = register_or_login("executor2@devcontest.ru", "executor2", "test1234", "executor")
executor2_token = executor2_resp["access_token"] if executor2_resp else None
print(f"  executor2 → {'OK id=' + str(executor2_resp['user']['id']) if executor2_resp else 'FAIL'}")

# ── Wallet top-ups ─────────────────────────────────────────────────────────────

print("\n=== Topping up wallets ===")

if customer_token:
    ok = topup_wallet(50000, customer_token, "customer1")
    bal = get_wallet_balance(customer_token)
    print(f"  customer1 → {'OK' if ok else 'FAIL'} | баланс: {bal} ₽")

if executor_token:
    ok = topup_wallet(5000, executor_token, "executor1")
    bal = get_wallet_balance(executor_token)
    print(f"  executor1 → {'OK' if ok else 'FAIL'} | баланс: {bal} ₽")

if executor2_token:
    ok = topup_wallet(3000, executor2_token, "executor2")
    bal = get_wallet_balance(executor2_token)
    print(f"  executor2 → {'OK' if ok else 'FAIL'} | баланс: {bal} ₽")

# ── Contest Types ──────────────────────────────────────────────────────────────

print("\n=== Creating contest types ===")

type_ids = {}
_, existing = get(f"{CONTEST_API}/contest-types")
if isinstance(existing, list):
    for t in existing:
        type_ids[t["name"]] = t["id"]

for name in ["Статья", "Логотип", "Баннер", "Иконка"]:
    if name in type_ids:
        print(f"  {name} → already exists id={type_ids[name]}")
        continue
    if not admin_token:
        print(f"  {name} → SKIP (no admin token)")
        continue
    status, ct = post(f"{CONTEST_API}/contest-types", {"name": name}, admin_token)
    if status == 201:
        type_ids[name] = ct["id"]
        print(f"  {name} → id={ct['id']}")
    else:
        print(f"  {name} → FAIL {status} {ct}")

logo_type    = type_ids.get("Логотип")
article_type = type_ids.get("Статья")
banner_type  = type_ids.get("Баннер")

# ── Contests ───────────────────────────────────────────────────────────────────

print("\n=== Creating contests ===")

c1 = c2 = c3 = None

if not customer_token:
    print("  SKIP — no customer token")
else:
    now = datetime.now(timezone.utc)

    # Contest 1: Logo design (with stages and prize_amount)
    status, c1 = post(
        f"{CONTEST_API}/contests",
        {
            "title": "Разработка логотипа для IT-стартапа",
            "annotation": "Нужен современный логотип для технологической компании",
            "description": (
                "Ищем дизайнера для создания логотипа стартапа. "
                "Компания разрабатывает SaaS-продукты для малого бизнеса. "
                "Логотип должен отражать инновационность и надёжность."
            ),
            "tz_text": (
                "Требования к логотипу:\n"
                "1. Формат: SVG + PNG (прозрачный фон)\n"
                "2. Цветовая гамма: синий + белый\n"
                "3. Должен читаться на тёмном и светлом фоне\n"
                "4. Шрифт: современный, без засечек\n"
                "5. Иконка + текстовая часть"
            ),
            "prizepool": 15000,
            "ends_at": (now + timedelta(days=30)).isoformat(),
            "type_id": logo_type,
            "stages": [
                {
                    "name": "Концепции",
                    "description": "3 варианта концепции",
                    "order": 1,
                    "deadline": (now + timedelta(days=10)).isoformat(),
                    "prize_amount": 5000,
                },
                {
                    "name": "Финальный вариант",
                    "description": "Финальный логотип во всех форматах",
                    "order": 2,
                    "deadline": (now + timedelta(days=25)).isoformat(),
                    "prize_amount": 10000,
                },
            ],
        },
        customer_token,
    )
    c1 = c1 if status == 201 else None
    if c1:
        activated = activate_contest(c1["id"], 15000, customer_token)
        print(f"  Логотип для стартапа → OK id={c1['id']} | payment={'activated' if activated else 'FAIL'}")
    else:
        print(f"  Логотип для стартапа → FAIL {status}")

    # Contest 2: Article (no stages)
    status, c2 = post(
        f"{CONTEST_API}/contests",
        {
            "title": "Статья об искусственном интеллекте в медицине",
            "annotation": "Экспертная статья для корпоративного блога",
            "description": (
                "Нужна статья о применении ИИ в медицинской диагностике. "
                "Аудитория: IT-специалисты и менеджеры здравоохранения."
            ),
            "tz_text": (
                "Требования к статье:\n"
                "1. Объём: 3000–5000 слов\n"
                "2. Структура: введение, 4-5 разделов, заключение\n"
                "3. Минимум 5 ссылок на научные источники\n"
                "4. Примеры реальных кейсов\n"
                "5. Уникальность: >95%"
            ),
            "prizepool": 8000,
            "ends_at": (now + timedelta(days=14)).isoformat(),
            "type_id": article_type,
        },
        customer_token,
    )
    c2 = c2 if status == 201 else None
    if c2:
        activated = activate_contest(c2["id"], 8000, customer_token)
        print(f"  Статья об ИИ        → OK id={c2['id']} | payment={'activated' if activated else 'FAIL'}")
    else:
        print(f"  Статья об ИИ        → FAIL {status}")

    # Contest 3: Banners (with stages)
    status, c3 = post(
        f"{CONTEST_API}/contests",
        {
            "title": "Баннеры для рекламной кампании",
            "annotation": "Комплект баннеров для Google Ads и ВКонтакте",
            "description": "Комплект рекламных баннеров для продвижения онлайн-курсов по программированию.",
            "tz_text": (
                "Требования к баннерам:\n"
                "1. Размеры: 728x90, 300x250, 160x600, 1200x628\n"
                "2. Форматы: PNG + HTML5 (анимация до 15 сек)\n"
                "3. Цвета: #FF6B35, #2C3E50, белый\n"
                "4. Чёткий CTA\n"
                "5. Адаптация под тёмную и светлую тему"
            ),
            "prizepool": 12000,
            "ends_at": (now + timedelta(days=21)).isoformat(),
            "type_id": banner_type,
            "stages": [
                {
                    "name": "Макеты",
                    "description": "Статичные PNG-макеты всех размеров",
                    "order": 1,
                    "deadline": (now + timedelta(days=10)).isoformat(),
                    "prize_amount": 4000,
                },
                {
                    "name": "HTML5 анимация",
                    "description": "Анимированные версии баннеров",
                    "order": 2,
                    "deadline": (now + timedelta(days=18)).isoformat(),
                    "prize_amount": 8000,
                },
            ],
        },
        customer_token,
    )
    c3 = c3 if status == 201 else None
    if c3:
        activated = activate_contest(c3["id"], 12000, customer_token)
        print(f"  Баннеры для рекламы → OK id={c3['id']} | payment={'activated' if activated else 'FAIL'}")
    else:
        print(f"  Баннеры для рекламы → FAIL {status}")

# ── Submissions ────────────────────────────────────────────────────────────────

print("\n=== Creating submissions ===")

# Re-fetch contests to confirm active status before creating submissions
def get_contest(contest_id, token):
    _, c = get(f"{CONTEST_API}/contests/{contest_id}", token)
    return c if isinstance(c, dict) and c.get("status") == "active" else None

if c1 and executor_token:
    c1_active = get_contest(c1["id"], executor_token)
    if c1_active:
        status, s1 = post(
            f"{CONTEST_API}/submissions",
            {
                "contest_id": c1["id"],
                "title": "Минималистичный логотип TechFlow",
                "annotation": "Чистый геометрический логотип в синей гамме",
                "description": (
                    "Логотип в стиле минимализм: стилизованная буква T, образующая поток данных. "
                    "Цветовая схема: #1A73E8 (основной), белый. "
                    "SVG и PNG 512x512, 256x256, 128x128."
                ),
            },
            executor_token,
        )
        print(f"  Лого TechFlow (executor1) → {'OK id=' + str(s1['id']) if status == 201 else f'FAIL {status} {s1}'}")
    else:
        print(f"  Лого TechFlow (executor1) → SKIP (contest not active)")

if c1 and executor2_token:
    c1_active = get_contest(c1["id"], executor2_token)
    if c1_active:
        status, s2 = post(
            f"{CONTEST_API}/submissions",
            {
                "contest_id": c1["id"],
                "title": "Динамичный логотип с градиентом",
                "annotation": "Современный логотип с градиентом",
                "description": (
                    "Стилизованный символ бесконечности, переходящий в стрелку вперёд. "
                    "Градиент от #0052CC до #00B4D8. Варианты для светлого и тёмного фона."
                ),
            },
            executor2_token,
        )
        print(f"  Лого градиент (executor2) → {'OK id=' + str(s2['id']) if status == 201 else f'FAIL {status} {s2}'}")
    else:
        print(f"  Лого градиент (executor2) → SKIP (contest not active)")

if c2 and executor_token:
    c2_active = get_contest(c2["id"], executor_token)
    if c2_active:
        status, s3 = post(
            f"{CONTEST_API}/submissions",
            {
                "contest_id": c2["id"],
                "title": "ИИ в кардиологии: от диагностики к лечению",
                "annotation": "Обзор применения нейросетей в кардиологии",
                "description": (
                    "Статья о применении ИИ в анализе ЭКГ и эхокардиографии. "
                    "Кейсы Mayo Clinic и Сколтеха. 4200 слов, 7 источников, уникальность 97%."
                ),
            },
            executor_token,
        )
        print(f"  Статья ИИ (executor1)     → {'OK id=' + str(s3['id']) if status == 201 else f'FAIL {status} {s3}'}")
    else:
        print(f"  Статья ИИ (executor1)     → SKIP (contest not active)")

if c3 and executor2_token:
    c3_active = get_contest(c3["id"], executor2_token)
    if c3_active:
        status, s4 = post(
            f"{CONTEST_API}/submissions",
            {
                "contest_id": c3["id"],
                "title": "Баннеры CodeMaster Pro",
                "annotation": "Комплект из 4 баннеров с HTML5-анимацией",
                "description": (
                    "728x90, 300x250, 160x600, 1200x628. "
                    "Анимация 12 сек. CTA 'Начать бесплатно'. PNG и HTML5."
                ),
            },
            executor2_token,
        )
        print(f"  Баннеры (executor2)       → {'OK id=' + str(s4['id']) if status == 201 else f'FAIL {status} {s4}'}")
    else:
        print(f"  Баннеры (executor2)       → SKIP (contest not active)")

# ── Summary ────────────────────────────────────────────────────────────────────

print("\n=== Done! Credentials ===")
print("  admin     / admin123")
print("  customer1 / test1234  (кошелёк: 50 000 ₽)")
print("  executor1 / test1234  (кошелёк: 5 000 ₽)")
print("  executor2 / test1234  (кошелёк: 3 000 ₽)")
print("\n=== Payment service (stub mode) ===")
print("  Конкурсы активируются автоматически без YooKassa ключей.")
print("  Кошельки пополняются автоматически (re-run безопасен — не дублирует).")
print("  Для реальной оплаты: задайте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.")
