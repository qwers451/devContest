#!/usr/bin/env python3
"""Seed script: creates test users, contest types, contests, submissions, and PNG files."""

import json
import os
import struct
import time
import urllib.error
import urllib.request
import zlib
from datetime import datetime, timedelta, timezone

USER_API = os.getenv("SEED_USER_URL", "http://localhost:8001")
CONTEST_API = os.getenv("SEED_CONTEST_URL", "http://localhost:8002")
PAYMENT_API = os.getenv("SEED_PAYMENT_URL", "http://localhost:8004")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "cafdgadhffdah")


def request(method, url, data=None, token=None, headers=None):
    body = json.dumps(data).encode() if data else None
    if headers is None:
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


def post(url, data, token=None, headers=None):
    return request("POST", url, data, token, headers)


def get(url, token=None, headers=None):
    return request("GET", url, token=token, headers=headers)


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
    """Pay contest from wallet balance (works regardless of YooKassa config)."""
    status, resp = post(
        f"{PAYMENT_API}/payments/topup",
        {"contest_id": contest_id, "amount": amount, "use_balance": True},
        token,
    )
    if status in (200, 201):
        time.sleep(0.3)
        return True
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


def topup_wallet_internal(user_id, amount, label):
    """Directly credit user wallet via internal endpoint."""
    headers = {"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"}
    status, resp = post(
        f"{PAYMENT_API}/wallet/internal/credit",
        {
            "user_id": user_id,
            "amount": amount,
            "description": f"Seed topup for {label}",
        },
        headers=headers,
    )
    if status in (200, 201):
        print(f"    {label} wallet (internal) → OK +{amount} ₽")
        return True
    print(f"    internal wallet topup failed for {label}: {status} {resp}")
    return False


def make_png(width: int, height: int, rgb: tuple) -> bytes:
    """Create a minimal solid-color PNG image without external dependencies."""
    def write_chunk(chunk_type: bytes, data: bytes) -> bytes:
        length = struct.pack(">I", len(data))
        content = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(content) & 0xFFFFFFFF)
        return length + content + crc

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = write_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))
    idat = write_chunk(b"IDAT", zlib.compress(raw, 6))
    iend = write_chunk(b"IEND", b"")
    return signature + ihdr + idat + iend


def make_pdf(text: str) -> bytes:
    """Create a minimal valid single-page PDF with given text (pure stdlib, no reportlab)."""
    lines: list[str] = []
    for line in text.split("\n"):
        while len(line) > 90:
            lines.append(line[:90])
            line = line[90:]
        lines.append(line)

    stream_parts = ["BT", "/F1 11 Tf", "50 750 Td", "14 TL"]
    for line in lines[:60]:
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream_parts.append(f"({safe}) Tj T*")
    stream_parts.append("ET")
    stream_content = "\n".join(stream_parts).encode()

    obj1 = b"<< /Type /Catalog /Pages 2 0 R >>"
    obj2 = b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"
    obj3 = b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
    obj4 = f"<< /Length {len(stream_content)} >>\nstream\n".encode() + stream_content + b"\nendstream"
    obj5 = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    objects = [obj1, obj2, obj3, obj4, obj5]

    out = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects):
        offsets.append(len(out))
        out += f"{i + 1} 0 obj\n".encode() + obj + b"\nendobj\n"

    xref_offset = len(out)
    out += b"xref\n"
    out += f"0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += b"trailer\n"
    out += f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n".encode()
    out += b"startxref\n"
    out += f"{xref_offset}\n".encode()
    out += b"%%EOF\n"
    return out


def make_docx(text: str) -> bytes:
    """Create a minimal valid DOCX with given text (pure stdlib, no python-docx required)."""
    import io
    import zipfile

    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="xml" ContentType="application/xml"/>\n'
        '  <Override PartName="/word/document.xml"'
        ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rId1"'
        ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
        ' Target="word/document.xml"/>\n'
        "</Relationships>"
    )
    word_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        "</Relationships>"
    )

    paragraphs = ""
    for line in text.split("\n"):
        escaped = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        paragraphs += f'<w:p><w:r><w:t xml:space="preserve">{escaped}</w:t></w:r></w:p>\n'

    document = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n'
        "  <w:body>\n"
        + paragraphs
        + "  </w:body>\n</w:document>"
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/_rels/document.xml.rels", word_rels)
    return buf.getvalue()


def upload_file_multipart(
    url: str,
    token: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    field_name: str = "file",
):
    """Upload any file via multipart/form-data."""
    boundary = "SeedFileBoundary99"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + file_bytes + f"\r\n--{boundary}--\r\n".encode()
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Authorization": f"Bearer {token}",
    }
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode())
        except Exception:
            err_body = {"detail": e.reason}
        return e.code, err_body


def upload_png(submission_id: int, token: str, png_bytes: bytes, filename: str):
    """Upload PNG file to submission via multipart/form-data."""
    boundary = "SeedPNGBoundary42"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + png_bytes + f"\r\n--{boundary}--\r\n".encode()
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Authorization": f"Bearer {token}",
    }
    req = urllib.request.Request(
        f"{CONTEST_API}/submissions/{submission_id}/files",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode())
        except Exception:
            err_body = {"detail": e.reason}
        return e.code, err_body


# ── Users ─────────────────────────────────────────────────────────────────────

print("=== Creating users ===")

admin_resp = register_or_login("admin@devcontest.ru", "admin", "admin123", "admin")
admin_token = admin_resp["access_token"] if admin_resp else None
admin_id = admin_resp["user"]["id"] if admin_resp else None
print(f"  admin     → {'OK id=' + str(admin_id) if admin_id else 'FAIL'}")

customer_resp = register_or_login(
    "customer@devcontest.ru", "customer1", "test1234", "customer"
)
customer_token = customer_resp["access_token"] if customer_resp else None
customer_id = customer_resp["user"]["id"] if customer_resp else None
print(f"  customer1 → {'OK id=' + str(customer_id) if customer_id else 'FAIL'}")

executor_resp = register_or_login(
    "executor@devcontest.ru", "executor1", "test1234", "executor"
)
executor_token = executor_resp["access_token"] if executor_resp else None
executor_id = executor_resp["user"]["id"] if executor_resp else None
print(f"  executor1 → {'OK id=' + str(executor_id) if executor_id else 'FAIL'}")

executor2_resp = register_or_login(
    "executor2@devcontest.ru", "executor2", "test1234", "executor"
)
executor2_token = executor2_resp["access_token"] if executor2_resp else None
executor2_id = executor2_resp["user"]["id"] if executor2_resp else None
print(f"  executor2 → {'OK id=' + str(executor2_id) if executor2_id else 'FAIL'}")

# ── Wallet top-ups ─────────────────────────────────────────────────────────────

print("\n=== Topping up wallets ===")

if customer_id and customer_token:
    balance = get_wallet_balance(customer_token)
    if balance is not None and balance < 50000:
        topup_wallet_internal(customer_id, 50000, "customer1")
    bal = get_wallet_balance(customer_token)
    print(f"  customer1 → баланс: {bal} ₽")

if executor_id and executor_token:
    balance = get_wallet_balance(executor_token)
    if balance is not None and balance < 5000:
        topup_wallet_internal(executor_id, 5000, "executor1")
    bal = get_wallet_balance(executor_token)
    print(f"  executor1 → баланс: {bal} ₽")

if executor2_id and executor2_token:
    balance = get_wallet_balance(executor2_token)
    if balance is not None and balance < 3000:
        topup_wallet_internal(executor2_id, 3000, "executor2")
    bal = get_wallet_balance(executor2_token)
    print(f"  executor2 → баланс: {bal} ₽")

if admin_id and admin_token:
    balance = get_wallet_balance(admin_token)
    if balance is not None and balance < 10000:
        topup_wallet_internal(admin_id, 10000, "admin")
    bal = get_wallet_balance(admin_token)
    print(f"  admin     → баланс: {bal} ₽")


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

logo_type = type_ids.get("Логотип")
article_type = type_ids.get("Статья")
banner_type = type_ids.get("Баннер")

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
        print(
            f"  Логотип для стартапа → OK id={c1['id']} | payment={'activated' if activated else 'FAIL'}"
        )
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
        print(
            f"  Статья об ИИ        → OK id={c2['id']} | payment={'activated' if activated else 'FAIL'}"
        )
    else:
        print(f"  Статья об ИИ        → FAIL {status}")

    # Contest 3: Banners (with stages, PNG-focused TZ for vision testing)
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
                "3. Цвета: #FF6B35 (оранжевый), #2C3E50 (тёмно-синий), белый\n"
                "4. Чёткий CTA (призыв к действию)\n"
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
        print(
            f"  Баннеры для рекламы → OK id={c3['id']} | payment={'activated' if activated else 'FAIL'}"
        )
    else:
        print(f"  Баннеры для рекламы → FAIL {status}")

# ── Submissions ────────────────────────────────────────────────────────────────

print("\n=== Creating submissions ===")

s1 = s2 = s3 = s4 = None


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
        s1 = s1 if status == 201 else None
        print(
            f"  Лого TechFlow (executor1) → {'OK id=' + str(s1['id']) if s1 else f'FAIL {status}'}"
        )
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
        s2 = s2 if status == 201 else None
        print(
            f"  Лого градиент (executor2) → {'OK id=' + str(s2['id']) if s2 else f'FAIL {status}'}"
        )
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
        s3 = s3 if status == 201 else None
        print(
            f"  Статья ИИ (executor1)     → {'OK id=' + str(s3['id']) if s3 else f'FAIL {status}'}"
        )
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
                    "Размеры: 728x90, 300x250, 160x600, 1200x628. "
                    "Анимация 12 сек. CTA 'Начать бесплатно'. "
                    "Цвета: оранжевый #FF6B35, тёмно-синий #2C3E50, белый. "
                    "Форматы: PNG и HTML5. Светлая и тёмная тема."
                ),
            },
            executor2_token,
        )
        s4 = s4 if status == 201 else None
        print(
            f"  Баннеры (executor2)       → {'OK id=' + str(s4['id']) if s4 else f'FAIL {status}'}"
        )
    else:
        print(f"  Баннеры (executor2)       → SKIP (contest not active)")

# ── PNG file uploads (for vision evaluation testing) ──────────────────────────

print("\n=== Uploading test PNG files ===")

# Logo submission: синий логотип 200x200
if s1 and executor_token:
    png = make_png(200, 200, (26, 115, 232))   # #1A73E8 синий
    st, resp = upload_png(s1["id"], executor_token, png, "logo_techflow.png")
    print(
        f"  logo_techflow.png → submission {s1['id']} "
        f"{'OK (' + str(len(png)) + ' bytes)' if st == 200 else f'FAIL {st} {resp}'}"
    )

# Logo submission 2: голубой логотип 200x200
if s2 and executor2_token:
    png = make_png(200, 200, (0, 180, 216))    # #00B4D8 голубой
    st, resp = upload_png(s2["id"], executor2_token, png, "logo_gradient.png")
    print(
        f"  logo_gradient.png → submission {s2['id']} "
        f"{'OK (' + str(len(png)) + ' bytes)' if st == 200 else f'FAIL {st} {resp}'}"
    )

# Banner submission: оранжевый баннер 728x90 (leaderboard)
if s4 and executor2_token:
    png_728 = make_png(728, 90, (255, 107, 53))   # #FF6B35 оранжевый
    st, resp = upload_png(s4["id"], executor2_token, png_728, "banner_728x90.png")
    print(
        f"  banner_728x90.png → submission {s4['id']} "
        f"{'OK (' + str(len(png_728)) + ' bytes)' if st == 200 else f'FAIL {st} {resp}'}"
    )
    # Также прикрепим баннер 300x250
    png_300 = make_png(300, 250, (44, 62, 80))    # #2C3E50 тёмно-синий
    st, resp = upload_png(s4["id"], executor2_token, png_300, "banner_300x250.png")
    print(
        f"  banner_300x250.png → submission {s4['id']} "
        f"{'OK (' + str(len(png_300)) + ' bytes)' if st == 200 else f'FAIL {st} {resp}'}"
    )

# ── TZ file upload (PDF) — contest c2 "Статья об ИИ" ─────────────────────────

print("\n=== Uploading TZ as PDF (contest c2 — Статья об ИИ) ===")

if c2 and customer_token:
    tz_pdf_text = (
        "Техническое задание: Статья об искусственном интеллекте в медицине\n\n"
        "1. Объём: 3000–5000 слов\n"
        "2. Структура: введение, 4–5 разделов, заключение\n"
        "3. Минимум 5 ссылок на рецензируемые научные источники (PubMed, Scopus)\n"
        "4. Примеры реальных внедрений ИИ: Mayo Clinic, Skoltech, DeepMind Health\n"
        "5. Уникальность текста: не менее 95% по Антиплагиат\n"
        "6. Язык: русский, стиль — научно-популярный\n"
        "7. Формат сдачи: DOCX или PDF\n\n"
        "Критические требования (невыполнение = отклонение работы):\n"
        "- Структура с разделами обязательна\n"
        "- Ссылки на источники обязательны\n"
        "- Объём не менее 3000 слов\n"
    )
    pdf_bytes = make_pdf(tz_pdf_text)
    st, resp = upload_file_multipart(
        f"{CONTEST_API}/contests/{c2['id']}/tz-file",
        customer_token,
        pdf_bytes,
        "tz_article_ai.pdf",
        "application/pdf",
        field_name="file",
    )
    if st == 200:
        print(
            f"  tz_article_ai.pdf → contest {c2['id']} OK "
            f"({len(pdf_bytes)} bytes, tz_text updated)"
        )
    else:
        print(f"  tz_article_ai.pdf → FAIL {st} {resp}")
else:
    print("  SKIP — contest c2 or customer_token missing")


# ── DOCX submission file upload — s3 "Статья ИИ" ──────────────────────────────

print("\n=== Uploading submission as DOCX (s3 — Статья ИИ executor1) ===")

if s3 and executor_token:
    article_text = (
        "ИИ в кардиологии: от диагностики к лечению\n\n"
        "Введение\n\n"
        "Искусственный интеллект (ИИ) за последние годы стал неотъемлемой частью медицинской "
        "диагностики. Особенно значительный прогресс достигнут в кардиологии, где нейросетевые "
        "алгоритмы успешно анализируют данные ЭКГ, эхокардиографии и МРТ сердца.\n\n"
        "1. Анализ электрокардиограмм\n\n"
        "Исследование Mayo Clinic (2019) показало, что свёрточная нейронная сеть способна "
        "обнаруживать бессимптомную дисфункцию левого желудочка с точностью 85% по данным "
        "стандартной 12-канальной ЭКГ. Это значительно превышает возможности врача-кардиолога "
        "при визуальном осмотре.\n"
        "Источник: Attia et al., Nature Medicine, 2019.\n\n"
        "2. Интерпретация эхокардиографии\n\n"
        "Модель EchoNet-Dynamic (Stanford) автоматически измеряет фракцию выброса ЛЖ из видео "
        "эхокардиографии с погрешностью ±6%, что сопоставимо с межврачебной вариабельностью.\n"
        "Источник: Ouyang et al., Nature, 2020.\n\n"
        "3. Прогнозирование риска\n\n"
        "Система QRISK3 с модулем машинного обучения (DeepMind Health) прогнозирует 10-летний "
        "риск сердечно-сосудистых событий, учитывая более 20 клинических параметров.\n"
        "Источник: Hippisley-Cox et al., BMJ, 2017.\n\n"
        "4. Российский опыт: Сколтех\n\n"
        "Команда Сколтеха разработала алгоритм на основе трансформеров для анализа длительных "
        "записей ХМ-ЭКГ (холтер). Алгоритм детектирует пароксизмальную фибрилляцию предсердий "
        "с чувствительностью 97% и специфичностью 96%.\n"
        "Источник: Natarajan et al., Computers in Biology and Medicine, 2020.\n\n"
        "5. Ограничения и этические вопросы\n\n"
        "Несмотря на высокую точность, внедрение ИИ в клиническую практику сопряжено с рядом "
        "проблем: необходимость объяснимости решений, риск алгоритмических предубеждений, "
        "правовые аспекты ответственности при ошибках диагностики.\n\n"
        "Заключение\n\n"
        "ИИ-инструменты в кардиологии демонстрируют клинически значимую эффективность и уже "
        "внедряются в реальную практику. Ключевыми задачами остаются валидация на широких "
        "популяциях, обеспечение прозрачности алгоритмов и разработка регуляторной базы.\n\n"
        "Список источников:\n"
        "1. Attia et al. — Nature Medicine, 2019\n"
        "2. Ouyang et al. — Nature, 2020\n"
        "3. Hippisley-Cox et al. — BMJ, 2017\n"
        "4. Natarajan et al. — Computers in Biology and Medicine, 2020\n"
        "5. Topol E.J. — Nature Medicine, 2019 (Deep learning in medicine)\n"
        "6. Rajpurkar et al. — arXiv, 2017 (Cardiologist-level arrhythmia detection)\n"
        "7. Poplin et al. — Nature Biomedical Engineering, 2018\n"
    )
    docx_bytes = make_docx(article_text)
    st, resp = upload_file_multipart(
        f"{CONTEST_API}/submissions/{s3['id']}/files",
        executor_token,
        docx_bytes,
        "article_ai_cardiology.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        field_name="files",
    )
    if st == 200:
        print(
            f"  article_ai_cardiology.docx → submission {s3['id']} OK "
            f"({len(docx_bytes)} bytes)"
        )
    else:
        print(f"  article_ai_cardiology.docx → FAIL {st} {resp}")
else:
    print("  SKIP — submission s3 or executor_token missing")


# ── Summary ────────────────────────────────────────────────────────────────────

print("\n=== Done! Credentials ===")
print("  admin     / admin123   (кошелёк: 10 000 ₽)")
print("  customer1 / test1234   (кошелёк: ~50 000 ₽ минус оплата конкурсов)")
print("  executor1 / test1234   (кошелёк: 5 000 ₽)")
print("  executor2 / test1234   (кошелёк: 3 000 ₽)")

print("\n=== Тестирование AI-оценки ===")
print("  Файлы, загруженные для тестирования оценщика:")
if s1:
    print(f"  • PNG  Лого TechFlow (executor1)    id={s1['id']} → logo_techflow.png (200×200, синий)")
if s2:
    print(f"  • PNG  Лого градиент (executor2)    id={s2['id']} → logo_gradient.png (200×200, голубой)")
if s4:
    print(f"  • PNG  Баннеры (executor2)          id={s4['id']} → banner_728×90 + 300×250")
if s3:
    print(f"  • DOCX Статья ИИ (executor1)        id={s3['id']} → article_ai_cardiology.docx")
if c2:
    print(f"  • PDF  ТЗ конкурса Статья об ИИ     id={c2['id']} → tz_article_ai.pdf (загружен в tz_text)")
print()
print("  Как тестировать DOCX/PDF-оценку:")
print("  1. Зайди как executor1 → открой решение 'ИИ в кардиологии' (s3)")
print("  2. Нажми 'Запустить оценку' — evaluation-service извлечёт текст из DOCX")
print("     и проверит соответствие ТЗ (загруженному как PDF)")
print("  3. Зайди как executor2 → открой решение с баннерами (s4)")
print("     Нажми 'Запустить оценку' — llava:7b получит PNG с метаданными размеров")
print()
print("  Модель: llava:7b. Убедись что скачана: ollama pull llava:7b")
print("  Результат появится через ~30–60 сек (спиннер на странице решения).")
print("  EVALUATION_STUB=false обязателен для реальной оценки.")

print("\n=== Тестирование майлстоунов (поэтапной оплаты) ===")
print("  Конкурсы с этапами и prize_amount:")
if c1:
    stages_info = " | ".join(
        f"{s['name']}: {s.get('prize_amount', 0)} ₽"
        for s in c1.get("stages", [])
    )
    print(f"  1. 'Логотип для стартапа' id={c1['id']}  [{stages_info}]")
    print(f"     Заходи как customer1 → открой заявку executor1 или executor2")
if c3:
    stages_info = " | ".join(
        f"{s['name']}: {s.get('prize_amount', 0)} ₽"
        for s in c3.get("stages", [])
    )
    print(f"  2. 'Баннеры для рекламной кампании' id={c3['id']}  [{stages_info}]")
    print(f"     Заходи как customer1 → открой заявку executor2")

print("\n=== Прочее ===")
print("  Возвраты: кнопка 'Вернуть' на странице Кошелёк (только статус 'held').")
print("  Re-run безопасен: балансы не дублируются, конкурсы не создаются повторно.")
