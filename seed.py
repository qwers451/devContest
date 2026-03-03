#!/usr/bin/env python3
"""Seed script: creates test users, contest types, contests, and submissions."""

import json
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

USER_API = "http://localhost:8001"
CONTEST_API = "http://localhost:8002"


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


def register_or_login(email, login, password, role):
    """Register user; if login is taken (409) — login instead."""
    status, resp = post(f"{USER_API}/auth/register", {
        "email": email, "login": login, "password": password, "role": role,
    })
    if status == 201:
        return resp
    if status == 409:
        status2, resp2 = post(f"{USER_API}/auth/login", {"login": login, "password": password})
        if status2 == 200:
            return resp2
        print(f"    login fallback also failed: {status2} {resp2}")
        return None
    print(f"    register failed: {status} {resp}")
    return None


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

# ── Contest Types ──────────────────────────────────────────────────────────────

print("\n=== Creating contest types ===")

if not admin_token:
    print("  SKIP — no admin token")

type_ids = {}
for name in ["Статья", "Логотип", "Баннер", "Иконка"]:
    if not admin_token:
        break
    status, ct = post(f"{CONTEST_API}/contest-types", {"name": name}, admin_token)
    if status == 201:
        type_ids[name] = ct["id"]
        print(f"  {name} → id={ct['id']}")
    elif status == 409:
        # already exists — fetch from list
        _, types_list = get(f"{CONTEST_API}/contest-types")
        for t in (types_list if isinstance(types_list, list) else []):
            if t["name"] == name:
                type_ids[name] = t["id"]
                print(f"  {name} → already exists id={t['id']}")
                break
    else:
        print(f"  {name} → FAIL {status} {ct}")

logo_type   = type_ids.get("Логотип")
article_type = type_ids.get("Статья")
banner_type  = type_ids.get("Баннер")

# ── Contests ───────────────────────────────────────────────────────────────────

print("\n=== Creating contests ===")

if not customer_token:
    print("  SKIP — no customer token")
else:
    now = datetime.now(timezone.utc)

    status, c1 = post(f"{CONTEST_API}/contests", {
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
            {"name": "Концепции", "description": "3 варианта концепции", "order": 1,
             "deadline": (now + timedelta(days=10)).isoformat()},
            {"name": "Финальный вариант", "description": "Финальный логотип во всех форматах", "order": 2,
             "deadline": (now + timedelta(days=25)).isoformat()},
        ],
    }, customer_token)
    c1 = c1 if status == 201 else None
    print(f"  Логотип для стартапа → {'OK id=' + str(c1['id']) if c1 else f'FAIL {status}'}")

    status, c2 = post(f"{CONTEST_API}/contests", {
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
    }, customer_token)
    c2 = c2 if status == 201 else None
    print(f"  Статья об ИИ       → {'OK id=' + str(c2['id']) if c2 else f'FAIL {status}'}")

    status, c3 = post(f"{CONTEST_API}/contests", {
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
    }, customer_token)
    c3 = c3 if status == 201 else None
    print(f"  Баннеры для рекламы → {'OK id=' + str(c3['id']) if c3 else f'FAIL {status}'}")

# ── Submissions ────────────────────────────────────────────────────────────────

print("\n=== Creating submissions ===")

if c1 and executor_token:
    status, s1 = post(f"{CONTEST_API}/submissions", {
        "contest_id": c1["id"],
        "title": "Минималистичный логотип TechFlow",
        "annotation": "Чистый геометрический логотип в синей гамме",
        "description": (
            "Логотип в стиле минимализм: стилизованная буква T, образующая поток данных. "
            "Цветовая схема: #1A73E8 (основной), белый. "
            "SVG и PNG 512x512, 256x256, 128x128."
        ),
    }, executor_token)
    print(f"  Лого TechFlow (executor1) → {'OK id=' + str(s1['id']) if status == 201 else f'FAIL {status} {s1}'}")

if c1 and executor2_token:
    status, s2 = post(f"{CONTEST_API}/submissions", {
        "contest_id": c1["id"],
        "title": "Динамичный логотип с градиентом",
        "annotation": "Современный логотип с градиентом",
        "description": (
            "Стилизованный символ бесконечности, переходящий в стрелку вперёд. "
            "Градиент от #0052CC до #00B4D8. Варианты для светлого и тёмного фона."
        ),
    }, executor2_token)
    print(f"  Лого градиент (executor2) → {'OK id=' + str(s2['id']) if status == 201 else f'FAIL {status} {s2}'}")

if c2 and executor_token:
    status, s3 = post(f"{CONTEST_API}/submissions", {
        "contest_id": c2["id"],
        "title": "ИИ в кардиологии: от диагностики к лечению",
        "annotation": "Обзор применения нейросетей в кардиологии",
        "description": (
            "Статья о применении ИИ в анализе ЭКГ и эхокардиографии. "
            "Кейсы Mayo Clinic и Сколтеха. 4200 слов, 7 источников, уникальность 97%."
        ),
    }, executor_token)
    print(f"  Статья ИИ (executor1)     → {'OK id=' + str(s3['id']) if status == 201 else f'FAIL {status} {s3}'}")

if c3 and executor2_token:
    status, s4 = post(f"{CONTEST_API}/submissions", {
        "contest_id": c3["id"],
        "title": "Баннеры CodeMaster Pro",
        "annotation": "Комплект из 4 баннеров с HTML5-анимацией",
        "description": (
            "728x90, 300x250, 160x600, 1200x628. "
            "Анимация 12 сек. CTA 'Начать бесплатно'. PNG и HTML5."
        ),
    }, executor2_token)
    print(f"  Баннеры (executor2)       → {'OK id=' + str(s4['id']) if status == 201 else f'FAIL {status} {s4}'}")

# ── Summary ────────────────────────────────────────────────────────────────────

print("\n=== Done! Credentials ===")
print("  admin     / admin123")
print("  customer1 / test1234")
print("  executor1 / test1234")
print("  executor2 / test1234")
