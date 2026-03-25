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
    status, resp = get(f"{PAYMENT_API}/wallet/balance", token)
    if status == 200:
        return resp.get("balance", 0)
    return None


def topup_wallet_internal(user_id, amount, label):
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
    lines: list[str] = []
    for line in text.split("\n"):
        # Replace any non-ASCII chars that slipped through with '?'
        line = line.encode("ascii", errors="replace").decode("ascii")
        while len(line) > 90:
            lines.append(line[:90])
            line = line[90:]
        lines.append(line)

    stream_parts = ["BT", "/F1 11 Tf", "50 750 Td", "14 TL"]
    for line in lines[:60]:
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream_parts.append(f"({safe}) Tj T*")
    stream_parts.append("ET")
    stream_content = "\n".join(stream_parts).encode("ascii")

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


def add_review(submission_id: int, token: str, score: float, commentary: str, label: str):
    """Add a customer review to a submission."""
    status, resp = post(
        f"{CONTEST_API}/submissions/{submission_id}/reviews",
        {"score": score, "commentary": commentary},
        token,
    )
    if status == 201:
        print(f"  Отзыв для submission {submission_id} [{label}] → OK score={score}")
        return resp
    elif status == 409:
        print(f"  Отзыв для submission {submission_id} [{label}] → уже существует")
        return None
    else:
        print(f"  Отзыв для submission {submission_id} [{label}] → FAIL {status} {resp}")
        return None


def change_status(submission_id: int, new_status: int, token: str, label: str):
    """Change submission status."""
    status, resp = patch(
        f"{CONTEST_API}/submissions/{submission_id}/status?status={new_status}",
        token=token,
    )
    if status == 200:
        print(f"  Статус submission {submission_id} → {new_status} ({label})")
        return True
    else:
        print(f"  Статус submission {submission_id} → FAIL {status} {resp}")
        return False


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

executor3_resp = register_or_login(
    "executor3@devcontest.ru", "executor3", "test1234", "executor"
)
executor3_token = executor3_resp["access_token"] if executor3_resp else None
executor3_id = executor3_resp["user"]["id"] if executor3_resp else None
print(f"  executor3 → {'OK id=' + str(executor3_id) if executor3_id else 'FAIL'}")

# ── Wallet top-ups ─────────────────────────────────────────────────────────────

print("\n=== Topping up wallets ===")

if customer_id and customer_token:
    balance = get_wallet_balance(customer_token)
    if balance is not None and balance < 80000:
        topup_wallet_internal(customer_id, 80000, "customer1")
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

if executor3_id and executor3_token:
    balance = get_wallet_balance(executor3_token)
    if balance is not None and balance < 3000:
        topup_wallet_internal(executor3_id, 3000, "executor3")
    bal = get_wallet_balance(executor3_token)
    print(f"  executor3 → баланс: {bal} ₽")

if admin_id and admin_token:
    balance = get_wallet_balance(admin_token)
    if balance is not None and balance < 10000:
        topup_wallet_internal(admin_id, 10000, "admin")
    bal = get_wallet_balance(admin_token)
    print(f"  admin     → баланс: {bal} ₽")


# ── Contest Templates ──────────────────────────────────────────────────────────

print("\n=== Creating contest templates ===")

template_ids = {}
_, existing_templates = get(f"{CONTEST_API}/contest-templates")
if isinstance(existing_templates, list):
    for t in existing_templates:
        template_ids[t["name"]] = t["id"]

TEMPLATES = [
    {
        "name": "Логотип",
        "description": "Шаблон ТЗ для конкурса на разработку логотипа",
        "tz_template": (
            "Цветовая схема: [укажите цвета, например #FF0000 и #FFFFFF]\n"
            "Стиль: [минималистичный / детализированный / плоский / объёмный]\n"
            "Форма: [квадрат / круг / горизонтальный / вертикальный]\n"
            "Наличие текста на логотипе: [да / нет; если да — укажите текст]\n"
            "Форматы файлов: [SVG, PNG 512×512, PNG 1024×1024]\n"
            "Использование: [сайт / мобильное приложение / печать]\n"
            "Дополнительные требования: [опишите здесь]"
        ),
    },
    {
        "name": "Статья",
        "description": "Шаблон ТЗ для конкурса на написание статьи",
        "tz_template": (
            "Тема: [укажите тему]\n"
            "Объём: от [X] до [Y] слов\n"
            "Структура: введение, [N] разделов, заключение\n"
            "Стиль изложения: [официальный / разговорный / научно-популярный]\n"
            "Ключевые слова: [слово1, слово2, ...]\n"
            "Целевая аудитория: [опишите читателя]\n"
            "Призыв к действию в конце: [да / нет]\n"
            "Дополнительные требования: [ссылки, иллюстрации и т.д.]"
        ),
    },
    {
        "name": "Код",
        "description": "Шаблон ТЗ для конкурса на разработку программного кода",
        "tz_template": (
            "Язык программирования: [Python / JavaScript / другой]\n"
            "Фреймворк / библиотеки: [если требуется]\n"
            "Функциональность:\n"
            "  - [требование 1]\n"
            "  - [требование 2]\n"
            "  - [требование 3]\n"
            "База данных: [если требуется — укажите СУБД]\n"
            "Тесты: [да / нет]\n"
            "Документация: [README / комментарии в коде / Swagger]\n"
            "Формат сдачи: ZIP-архив с исходным кодом"
        ),
    },
    {
        "name": "Баннер",
        "description": "Шаблон ТЗ для конкурса на разработку баннера",
        "tz_template": (
            "Размеры: [ширина]×[высота] пикселей\n"
            "Форматы файлов: [PNG / JPEG]\n"
            "Цветовая схема: [укажите цвета]\n"
            "Текст на баннере: [заголовок, подзаголовок]\n"
            "Призыв к действию (CTA): [текст кнопки или слогана]\n"
            "Стиль: [корпоративный / яркий / минималистичный]\n"
            "Дополнительные требования: [опишите здесь]"
        ),
    },
]

for tmpl in TEMPLATES:
    if tmpl["name"] in template_ids:
        print(f"  {tmpl['name']} → already exists id={template_ids[tmpl['name']]}")
        continue
    if not admin_token:
        print(f"  {tmpl['name']} → SKIP (no admin token)")
        continue
    status, t = post(f"{CONTEST_API}/contest-templates", tmpl, admin_token)
    if status == 201:
        template_ids[tmpl["name"]] = t["id"]
        print(f"  {tmpl['name']} → id={t['id']}")
    else:
        print(f"  {tmpl['name']} → FAIL {status} {t}")

logo_template = template_ids.get("Логотип")
article_template = template_ids.get("Статья")
code_template = template_ids.get("Код")
banner_template = template_ids.get("Баннер")

# ── Contest Types ──────────────────────────────────────────────────────────────

print("\n=== Creating contest types ===")

type_ids = {}
_, existing = get(f"{CONTEST_API}/contest-types")
if isinstance(existing, list):
    for t in existing:
        type_ids[t["name"]] = t["id"]

for name in ["Статья", "Логотип", "Баннер", "Иконка", "Веб-разработка"]:
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
webdev_type = type_ids.get("Веб-разработка")

# ── Contests ───────────────────────────────────────────────────────────────────

print("\n=== Creating contests ===")

c1 = c2 = c3 = c4 = None

if not customer_token:
    print("  SKIP — no customer token")
else:
    now = datetime.now(timezone.utc)

    # Contest 1: Logo design (with stages)
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
                "5. Иконка + текстовая часть\n\n"
                "Критические требования:\n"
                "- SVG формат обязателен\n"
                "- PNG с прозрачным фоном обязателен"
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

    # Contest 2: Article — detailed TZ for AI evaluation testing
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
                "2. Структура: введение, минимум 4 раздела, заключение\n"
                "3. Минимум 5 ссылок на научные источники (PubMed, Scopus, Nature)\n"
                "4. Конкретные примеры реальных внедрений ИИ в медицине\n"
                "5. Уникальность текста: не менее 95%\n"
                "6. Язык: русский, научно-популярный стиль\n"
                "7. Обязательны: введение и заключение\n\n"
                "Критические требования (невыполнение = отклонение):\n"
                "- Структура с разделами обязательна\n"
                "- Список источников обязателен (минимум 5)\n"
                "- Введение и заключение обязательны\n"
                "- Объём не менее 3000 слов"
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

    # Contest 3: Banners (PNG-focused TZ for vision model testing)
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
                "5. Адаптация под тёмную и светлую тему\n"
                "6. Обязательно: баннер 728x90 (leaderboard)\n"
                "7. Обязательно: баннер 300x250 (medium rectangle)\n\n"
                "Критические требования:\n"
                "- PNG формат обязателен для всех размеров\n"
                "- Цветовая схема должна соответствовать брендбуку\n"
                "- CTA обязателен на каждом баннере"
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

    # Contest 4: Web API development — clear structured TZ for AI evaluation pass/fail testing
    status, c4 = post(
        f"{CONTEST_API}/contests",
        {
            "title": "REST API для интернет-магазина",
            "annotation": "Разработка бэкенда интернет-магазина на Python",
            "description": (
                "Требуется разработать полноценный REST API для интернет-магазина. "
                "Стек: Python + FastAPI или Django REST Framework + PostgreSQL. "
                "Срок: 3 недели."
            ),
            "tz_text": (
                "Техническое задание: REST API интернет-магазин\n\n"
                "Обязательные требования:\n"
                "1. Язык: Python (FastAPI или Django REST Framework)\n"
                "2. База данных: PostgreSQL с использованием SQLAlchemy или Django ORM\n"
                "3. Аутентификация: JWT токены (access + refresh)\n"
                "4. CRUD-операции для: товаров (products), заказов (orders), пользователей (users)\n"
                "5. Документация: Swagger/OpenAPI (автоматическая через FastAPI или drf-yasg)\n"
                "6. Тесты: покрытие не менее 80% (pytest или unittest)\n"
                "7. Docker: docker-compose.yml для запуска всего стека\n"
                "8. .env файл для конфигурации (не хранить секреты в коде)\n\n"
                "Критические требования (обязательны, иначе работа отклоняется):\n"
                "- JWT аутентификация обязательна\n"
                "- PostgreSQL обязателен (SQLite не принимается)\n"
                "- Docker-compose обязателен\n"
                "- Автотесты обязательны\n"
                "- Swagger/OpenAPI документация обязательна\n\n"
                "Структура сдачи:\n"
                "- Ссылка на репозиторий или архив с исходным кодом\n"
                "- README с инструкцией по запуску\n"
                "- Описание архитектуры"
            ),
            "prizepool": 25000,
            "ends_at": (now + timedelta(days=21)).isoformat(),
            "type_id": webdev_type,
            "stages": [
                {
                    "name": "Архитектура и БД",
                    "description": "Схема БД, структура проекта",
                    "order": 1,
                    "deadline": (now + timedelta(days=7)).isoformat(),
                    "prize_amount": 5000,
                },
                {
                    "name": "Реализация API",
                    "description": "Все эндпоинты, тесты, документация",
                    "order": 2,
                    "deadline": (now + timedelta(days=14)).isoformat(),
                    "prize_amount": 15000,
                },
                {
                    "name": "Деплой и документация",
                    "description": "Docker, README, финальная сдача",
                    "order": 3,
                    "deadline": (now + timedelta(days=21)).isoformat(),
                    "prize_amount": 5000,
                },
            ],
        },
        customer_token,
    )
    c4 = c4 if status == 201 else None
    if c4:
        activated = activate_contest(c4["id"], 25000, customer_token)
        print(
            f"  REST API магазин    → OK id={c4['id']} | payment={'activated' if activated else 'FAIL'}"
        )
    else:
        print(f"  REST API магазин    → FAIL {status}")

# ── Submissions ────────────────────────────────────────────────────────────────

print("\n=== Creating submissions ===")

s1 = s2 = s3 = s4 = s5 = s6 = None


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
                    "SVG и PNG 512x512, 256x256, 128x128. "
                    "PNG с прозрачным фоном. Шрифт без засечек (Montserrat)."
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
                    "Градиент от #0052CC до #00B4D8. Варианты для светлого и тёмного фона. "
                    "SVG и PNG с прозрачным фоном."
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
                    "Кейсы Mayo Clinic, Stanford и Сколтеха. "
                    "~4200 слов, 7 научных источников (Nature Medicine, Nature, BMJ), "
                    "уникальность 97%. Структура: введение, 5 разделов, заключение, список источников."
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

# Submission s5: PASSES all requirements of c4 (AI should give high score)
if c4 and executor_token:
    c4_active = get_contest(c4["id"], executor_token)
    if c4_active:
        status, s5 = post(
            f"{CONTEST_API}/submissions",
            {
                "contest_id": c4["id"],
                "title": "FastAPI Shop — полная реализация",
                "annotation": "REST API на FastAPI + PostgreSQL + JWT + Docker + тесты",
                "description": (
                    "Реализован REST API интернет-магазина на Python/FastAPI.\n\n"
                    "Стек: FastAPI, PostgreSQL, SQLAlchemy async, JWT (python-jose), Docker-compose.\n\n"
                    "Реализованные эндпоинты:\n"
                    "- /auth/register, /auth/login — регистрация и JWT аутентификация (access+refresh)\n"
                    "- /products CRUD — создание, получение, обновление, удаление товаров\n"
                    "- /orders CRUD — создание заказа, смена статуса, история заказов\n"
                    "- /users — профиль пользователя\n\n"
                    "Документация: Swagger UI доступен на /docs (автоматический OpenAPI).\n\n"
                    "Тесты: pytest, покрытие 87% (unit + integration через TestClient).\n\n"
                    "Запуск: docker-compose up --build (PostgreSQL + приложение).\n\n"
                    "Конфигурация через .env (DATABASE_URL, JWT_SECRET, не хранятся в коде).\n\n"
                    "Архитектура: layered (routes → services → repositories), async everywhere."
                ),
            },
            executor_token,
        )
        s5 = s5 if status == 201 else None
        print(
            f"  API Shop PASS (executor1) → {'OK id=' + str(s5['id']) if s5 else f'FAIL {status}'}"
        )
    else:
        print(f"  API Shop PASS (executor1) → SKIP (contest not active)")

# Submission s6: FAILS several critical requirements of c4 (AI should give low score)
if c4 and executor3_token:
    c4_active = get_contest(c4["id"], executor3_token)
    if c4_active:
        status, s6 = post(
            f"{CONTEST_API}/submissions",
            {
                "contest_id": c4["id"],
                "title": "Простой Flask-магазин (без Docker и тестов)",
                "annotation": "Базовый Flask API на SQLite без тестов",
                "description": (
                    "Реализован простой REST API на Flask.\n\n"
                    "Стек: Flask, SQLite (встроенная БД), сессии (не JWT).\n\n"
                    "Эндпоинты:\n"
                    "- /products — список товаров (GET)\n"
                    "- /products/<id> — получить товар (GET)\n"
                    "- /orders — создать заказ (POST)\n\n"
                    "Аутентификация: Basic Auth через Flask-HTTPAuth (не JWT).\n\n"
                    "БД: SQLite, встроенная в проект (не PostgreSQL).\n\n"
                    "Документация: нет (Swagger не настроен).\n\n"
                    "Тесты: нет (не успел написать).\n\n"
                    "Запуск: python app.py (Docker не настроен)."
                ),
            },
            executor3_token,
        )
        s6 = s6 if status == 201 else None
        print(
            f"  API Shop FAIL (executor3) → {'OK id=' + str(s6['id']) if s6 else f'FAIL {status}'}"
        )
    else:
        print(f"  API Shop FAIL (executor3) → SKIP (contest not active)")

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
    png_300 = make_png(300, 250, (44, 62, 80))    # #2C3E50 тёмно-синий
    st, resp = upload_png(s4["id"], executor2_token, png_300, "banner_300x250.png")
    print(
        f"  banner_300x250.png → submission {s4['id']} "
        f"{'OK (' + str(len(png_300)) + ' bytes)' if st == 200 else f'FAIL {st} {resp}'}"
    )
    png_160 = make_png(160, 600, (255, 107, 53))  # #FF6B35 скайскрапер
    st, resp = upload_png(s4["id"], executor2_token, png_160, "banner_160x600.png")
    print(
        f"  banner_160x600.png → submission {s4['id']} "
        f"{'OK (' + str(len(png_160)) + ' bytes)' if st == 200 else f'FAIL {st} {resp}'}"
    )

# ── TZ file upload (PDF) — contest c2 "Статья об ИИ" ─────────────────────────

print("\n=== Uploading TZ as PDF (contest c2 — Статья об ИИ) ===")

if c2 and customer_token:
    tz_pdf_text = (
        "Technical Specification: Article on Artificial Intelligence in Medicine\n\n"
        "Requirements:\n"
        "1. Length: 3000-5000 words\n"
        "2. Structure: introduction, at least 4 sections, conclusion\n"
        "3. At least 5 references to peer-reviewed scientific sources (PubMed, Scopus, Nature)\n"
        "4. Real-world examples of AI deployment in medicine (Mayo Clinic, Skoltech, DeepMind)\n"
        "5. Text uniqueness: at least 95%\n"
        "6. Style: popular science\n"
        "7. Submission format: DOCX or PDF\n\n"
        "Critical requirements (failure = rejection):\n"
        "- Sections structure is mandatory\n"
        "- List of references is mandatory (minimum 5 sources)\n"
        "- Introduction and conclusion are mandatory\n"
        "- Volume at least 3000 words\n"
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

# ── TZ file upload (PDF) — contest c4 "REST API" ──────────────────────────────

print("\n=== Uploading TZ as PDF (contest c4 — REST API) ===")

if c4 and customer_token:
    tz_c4_text = (
        "Technical Specification: REST API for Online Store\n\n"
        "Mandatory technical requirements:\n"
        "1. Language: Python (FastAPI or Django REST Framework)\n"
        "2. Database: PostgreSQL (SQLite is NOT acceptable)\n"
        "3. Authentication: JWT tokens (access token + refresh token)\n"
        "4. CRUD for products: create, read, update, delete\n"
        "5. CRUD for orders: create, status updates, order history\n"
        "6. CRUD for users: registration, profile\n"
        "7. Swagger/OpenAPI documentation (auto-generated)\n"
        "8. Automated tests (pytest): coverage >= 80%\n"
        "9. Docker-compose.yml: run entire stack with single command\n"
        "10. Configuration via .env file (no secrets in code)\n\n"
        "Critical requirements (mandatory, rejection if missing):\n"
        "- JWT authentication is mandatory\n"
        "- PostgreSQL is mandatory (SQLite not accepted)\n"
        "- Docker-compose is mandatory\n"
        "- Automated tests are mandatory\n"
        "- Swagger/OpenAPI documentation is mandatory\n\n"
        "Submission format:\n"
        "- Source code (archive or repository link)\n"
        "- README with launch instructions\n"
        "- Architecture description\n"
    )
    pdf_bytes = make_pdf(tz_c4_text)
    st, resp = upload_file_multipart(
        f"{CONTEST_API}/contests/{c4['id']}/tz-file",
        customer_token,
        pdf_bytes,
        "tz_rest_api_shop.pdf",
        "application/pdf",
        field_name="file",
    )
    if st == 200:
        print(
            f"  tz_rest_api_shop.pdf → contest {c4['id']} OK ({len(pdf_bytes)} bytes)"
        )
    else:
        print(f"  tz_rest_api_shop.pdf → FAIL {st} {resp}")
else:
    print("  SKIP — contest c4 or customer_token missing")

# ── DOCX submission file upload — s3 "Статья ИИ" ──────────────────────────────

print("\n=== Uploading submission as DOCX (s3 — Статья ИИ executor1) ===")

if s3 and executor_token:
    article_text = (
        "ИИ в кардиологии: от диагностики к лечению\n\n"
        "Введение\n\n"
        "Искусственный интеллект (ИИ) за последние годы стал неотъемлемой частью медицинской "
        "диагностики. Особенно значительный прогресс достигнут в кардиологии, где нейросетевые "
        "алгоритмы успешно анализируют данные ЭКГ, эхокардиографии и МРТ сердца. "
        "Данная статья представляет собой обзор ключевых применений ИИ в кардиологии, "
        "основанный на анализе последних научных публикаций и реальных внедрений. "
        "Рассматриваются как технические аспекты применяемых методов, так и клиническая "
        "эффективность, ограничения и этические вопросы.\n\n"
        "1. Анализ электрокардиограмм\n\n"
        "Исследование Mayo Clinic (2019) показало, что свёрточная нейронная сеть способна "
        "обнаруживать бессимптомную дисфункцию левого желудочка с точностью 85% по данным "
        "стандартной 12-канальной ЭКГ. Это значительно превышает возможности врача-кардиолога "
        "при визуальном осмотре. Модель обучалась на 44 959 пациентах и валидировалась "
        "на независимой когорте.\n"
        "Источник: Attia et al., Nature Medicine, 2019.\n\n"
        "2. Интерпретация эхокардиографии\n\n"
        "Модель EchoNet-Dynamic (Stanford) автоматически измеряет фракцию выброса ЛЖ из видео "
        "эхокардиографии с погрешностью ±6%, что сопоставимо с межврачебной вариабельностью. "
        "Архитектура: ResNet-50 + LSTM. Датасет: 10 030 исследований.\n"
        "Источник: Ouyang et al., Nature, 2020.\n\n"
        "3. Прогнозирование риска сердечно-сосудистых заболеваний\n\n"
        "Система QRISK3 с модулем машинного обучения (DeepMind Health) прогнозирует 10-летний "
        "риск сердечно-сосудистых событий, учитывая более 20 клинических параметров. "
        "Чувствительность на популяции 7 млн. пациентов: 78%, специфичность: 86%.\n"
        "Источник: Hippisley-Cox et al., BMJ, 2017.\n\n"
        "4. Российский опыт: Сколтех\n\n"
        "Команда Сколтеха разработала алгоритм на основе трансформеров для анализа длительных "
        "записей ХМ-ЭКГ (холтер). Алгоритм детектирует пароксизмальную фибрилляцию предсердий "
        "с чувствительностью 97% и специфичностью 96% на датасете из 8 528 пациентов.\n"
        "Источник: Natarajan et al., Computers in Biology and Medicine, 2020.\n\n"
        "5. Ограничения и этические вопросы\n\n"
        "Несмотря на высокую точность, внедрение ИИ в клиническую практику сопряжено с рядом "
        "проблем: необходимость объяснимости решений (Explainable AI), риск алгоритмических "
        "предубеждений в недостаточно репрезентативных обучающих выборках, "
        "правовые аспекты ответственности при ошибках диагностики, а также "
        "вопросы защиты персональных медицинских данных (GDPR, 152-ФЗ).\n\n"
        "Заключение\n\n"
        "ИИ-инструменты в кардиологии демонстрируют клинически значимую эффективность и уже "
        "внедряются в реальную практику ведущих медицинских учреждений мира. "
        "Ключевыми задачами остаются валидация на широких и разнородных популяциях, "
        "обеспечение прозрачности алгоритмов, проспективные клинические испытания "
        "и разработка регуляторной базы для медицинских ИИ-систем.\n\n"
        "Список источников:\n"
        "1. Attia Z.I. et al. Screening for cardiac contractile dysfunction using an "
        "artificial intelligence-enabled electrocardiogram. — Nature Medicine, 2019, Vol. 25.\n"
        "2. Ouyang D. et al. Video-based AI for beat-to-beat assessment of cardiac function. "
        "— Nature, 2020, Vol. 580.\n"
        "3. Hippisley-Cox J. et al. Development and validation of QRISK3. — BMJ, 2017.\n"
        "4. Natarajan A. et al. Wide-band EHR analysis of cardiac arrhythmias. "
        "— Computers in Biology and Medicine, 2020.\n"
        "5. Topol E.J. High-performance medicine: the convergence of human and artificial "
        "intelligence. — Nature Medicine, 2019, Vol. 25.\n"
        "6. Rajpurkar P. et al. Cardiologist-level arrhythmia detection with "
        "convolutional neural networks. — arXiv:1707.01836, 2017.\n"
        "7. Poplin R. et al. Prediction of cardiovascular risk factors from retinal fundus "
        "photographs via deep learning. — Nature Biomedical Engineering, 2018.\n"
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

# ── PDF submission file upload — s5 "API Shop PASS" ───────────────────────────

print("\n=== Uploading submission as PDF (s5 — FastAPI Shop PASS executor1) ===")

if s5 and executor_token:
    s5_pdf_text = (
        "FastAPI Shop - REST API for Online Store\n\n"
        "Tech stack:\n"
        "- Python 3.11, FastAPI 0.104\n"
        "- PostgreSQL 15 + SQLAlchemy 2.0 (async)\n"
        "- Authentication: JWT (python-jose), access token 30min + refresh 7 days\n"
        "- Docker-compose: app service + PostgreSQL + Alembic migrations\n\n"
        "Implemented API endpoints:\n\n"
        "Authentication (JWT):\n"
        "POST /auth/register - register new user\n"
        "POST /auth/login - get JWT access+refresh tokens\n"
        "POST /auth/refresh - renew access token\n\n"
        "Products CRUD:\n"
        "GET /products - list products with pagination and filters\n"
        "POST /products - create product (admin only)\n"
        "GET /products/{id} - get single product\n"
        "PUT /products/{id} - update product (admin only)\n"
        "DELETE /products/{id} - delete product (admin only)\n\n"
        "Orders CRUD:\n"
        "POST /orders - create order (authenticated users)\n"
        "GET /orders - user order history\n"
        "GET /orders/{id} - order details\n"
        "PATCH /orders/{id}/status - change status (admin)\n\n"
        "Users:\n"
        "GET /users/me - current user profile\n"
        "PUT /users/me - update profile\n\n"
        "Documentation:\n"
        "Swagger UI: http://localhost:8000/docs (auto-generated by FastAPI)\n"
        "OpenAPI JSON: http://localhost:8000/openapi.json\n\n"
        "Tests (pytest):\n"
        "pytest tests/ - 47 tests, coverage 87%\n"
        "Uses FastAPI TestClient + separate PostgreSQL test database\n\n"
        "Launch:\n"
        "docker-compose up --build\n"
        "App: http://localhost:8000\n\n"
        "Configuration (.env):\n"
        "DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/shopdb\n"
        "JWT_SECRET=your-secret-key\n"
        "JWT_ALGORITHM=HS256\n\n"
        "Architecture:\n"
        "Layered: routes -> services -> repositories\n"
        "Dependency injection via FastAPI Depends\n"
        "Async/await throughout, no blocking calls\n"
    )
    pdf_bytes = make_pdf(s5_pdf_text)
    st, resp = upload_file_multipart(
        f"{CONTEST_API}/submissions/{s5['id']}/files",
        executor_token,
        pdf_bytes,
        "fastapi_shop_documentation.pdf",
        "application/pdf",
        field_name="files",
    )
    if st == 200:
        print(
            f"  fastapi_shop_documentation.pdf → submission {s5['id']} OK "
            f"({len(pdf_bytes)} bytes)"
        )
    else:
        print(f"  fastapi_shop_documentation.pdf → FAIL {st} {resp}")
else:
    print("  SKIP — submission s5 or executor_token missing")

# ── PDF submission file upload — s6 "API Shop FAIL" ──────────────────────────

print("\n=== Uploading submission as PDF (s6 — Flask Shop FAIL executor3) ===")

if s6 and executor3_token:
    s6_pdf_text = (
        "Flask Shop - Simple REST API\n\n"
        "Tech stack:\n"
        "- Python 3.10, Flask 2.3\n"
        "- SQLite (built-in database, file shop.db)\n"
        "- Authentication: Basic Auth (login/password in header)\n"
        "- Deployment: python app.py (local run only)\n\n"
        "Implemented API endpoints:\n\n"
        "GET /products - list all products\n"
        "GET /products/<id> - get product by ID\n"
        "POST /orders - create order (requires Basic Auth)\n"
        "GET /orders/<id> - get order\n\n"
        "Notes:\n"
        "- Authentication via Flask-HTTPAuth (Basic Auth, NOT JWT)\n"
        "- Database: SQLite (PostgreSQL was not used - no time to set it up)\n"
        "- Swagger/OpenAPI documentation: NOT implemented\n"
        "- Tests: NOT written (planned for next iteration)\n"
        "- Docker: NOT configured, runs locally via python app.py only\n\n"
        "Launch:\n"
        "pip install flask flask-httpauth\n"
        "python app.py\n"
        "Server: http://localhost:5000\n\n"
        "Configuration:\n"
        "SECRET_KEY is hardcoded in app.py for simplicity\n"
    )
    pdf_bytes = make_pdf(s6_pdf_text)
    st, resp = upload_file_multipart(
        f"{CONTEST_API}/submissions/{s6['id']}/files",
        executor3_token,
        pdf_bytes,
        "flask_shop_readme.pdf",
        "application/pdf",
        field_name="files",
    )
    if st == 200:
        print(
            f"  flask_shop_readme.pdf → submission {s6['id']} OK "
            f"({len(pdf_bytes)} bytes)"
        )
    else:
        print(f"  flask_shop_readme.pdf → FAIL {st} {resp}")
else:
    print("  SKIP — submission s6 or executor3_token missing")

# ── Customer reviews ───────────────────────────────────────────────────────────

print("\n=== Adding customer reviews ===")

if s1 and customer_token:
    add_review(
        s1["id"], customer_token, 7.5,
        "Хороший минималистичный логотип. Синяя гамма соответствует ТЗ, буква T читается хорошо. "
        "Хотелось бы видеть больше вариантов с разными насыщенностями цвета. PNG с прозрачным фоном — ок.",
        "лого TechFlow",
    )

if s2 and customer_token:
    add_review(
        s2["id"], customer_token, 8.0,
        "Отличный динамичный дизайн. Градиент от синего к голубому смотрится современно. "
        "Символ бесконечности оригинален. Минус — слегка сложно читается на тёмном фоне.",
        "лого градиент",
    )

if s3 and customer_token:
    add_review(
        s3["id"], customer_token, 9.0,
        "Превосходная статья! Все разделы присутствуют, 7 источников из авторитетных журналов "
        "(Nature Medicine, BMJ). Кейсы Mayo Clinic и Сколтеха очень уместны. "
        "Введение и заключение хорошо структурированы. Объём около 4200 слов — соответствует ТЗ. "
        "Рекомендую к принятию.",
        "статья ИИ",
    )

if s4 and customer_token:
    add_review(
        s4["id"], customer_token, 6.5,
        "Баннеры представлены в правильных размерах. Цвета соответствуют брендбуку (#FF6B35, #2C3E50). "
        "Однако CTA 'Начать бесплатно' мог бы быть крупнее и заметнее. "
        "HTML5 анимация пока не загружена — жду финальную версию.",
        "баннеры",
    )

if s5 and customer_token:
    add_review(
        s5["id"], customer_token, 9.5,
        "Отличная работа! FastAPI + PostgreSQL + JWT — всё по ТЗ. "
        "Docker-compose работает с первой команды. Покрытие тестами 87% — выше требуемых 80%. "
        "Swagger автоматически сгенерирован. Код чистый, архитектура правильная. "
        "Принято!",
        "API Shop PASS",
    )

if s6 and customer_token:
    add_review(
        s6["id"], customer_token, 2.0,
        "К сожалению, работа не соответствует критическим требованиям ТЗ. "
        "Использован SQLite вместо PostgreSQL — критическое нарушение. "
        "JWT аутентификация отсутствует (Basic Auth не принимается) — критическое нарушение. "
        "Docker-compose отсутствует — критическое нарушение. "
        "Тесты отсутствуют — критическое нарушение. "
        "Swagger/OpenAPI отсутствует — критическое нарушение. "
        "Работа не может быть принята.",
        "API Shop FAIL",
    )

# ── Status changes (for status history testing) ───────────────────────────────

print("\n=== Updating submission statuses ===")

if s3 and customer_token:
    # Статья: принять (статус 2 = на проверке, затем 3 = принята)
    change_status(s3["id"], 2, customer_token, "на проверке")
    time.sleep(0.2)
    change_status(s3["id"], 3, customer_token, "принята")

if s5 and customer_token:
    # FastAPI Shop: одобрить
    change_status(s5["id"], 2, customer_token, "на проверке")
    time.sleep(0.2)
    change_status(s5["id"], 3, customer_token, "принята")

if s6 and customer_token:
    # Flask Shop: отклонить
    change_status(s6["id"], 5, customer_token, "отклонена")

# ── Summary ────────────────────────────────────────────────────────────────────

print("\n=== Done! Credentials ===")
print("  admin     / admin123   (кошелёк: 10 000 ₽)")
print("  customer1 / test1234   (кошелёк: ~80 000 ₽ минус оплата конкурсов)")
print("  executor1 / test1234   (кошелёк: 5 000 ₽)")
print("  executor2 / test1234   (кошелёк: 3 000 ₽)")
print("  executor3 / test1234   (кошелёк: 3 000 ₽)")

print("\n=== Тестирование AI-оценки ===")
print("  Тестовые пары 'хорошее / плохое' решение для одного конкурса:")
print()
if c4 and s5 and s6:
    print(f"  Конкурс: 'REST API магазин' id={c4['id']}")
    print(f"  ✅ PASS: submission id={s5['id']} (FastAPI+PostgreSQL+JWT+Docker+тесты+Swagger)")
    print(f"       → Ожидаемый AI score: высокий (80-100)")
    print(f"  ❌ FAIL: submission id={s6['id']} (Flask+SQLite+BasicAuth, без Docker/тестов/Swagger)")
    print(f"       → Ожидаемый AI score: низкий (0-30)")
print()
print("  Другие тестовые файлы:")
if s3:
    print(f"  📄 DOCX Статья ИИ (executor1)      id={s3['id']} → article_ai_cardiology.docx")
    print(f"       ТЗ: 5+ источников, структура, 3000+ слов | Статья: 7 источников, 5 разделов, ~4200 слов")
    print(f"       → Ожидаемый AI score: высокий (85-100)")
if s4:
    print(f"  🖼️  PNG  Баннеры (executor2)         id={s4['id']} → 3 PNG разных размеров")
    print(f"       → Тест vision модели (llava:7b)")
if s1:
    print(f"  🖼️  PNG  Лого TechFlow (executor1)   id={s1['id']} → logo_techflow.png")
if s2:
    print(f"  🖼️  PNG  Лого градиент (executor2)   id={s2['id']} → logo_gradient.png")

print()
print("  Как запустить AI-оценку:")
print("  1. Убедись что EVALUATION_STUB=false в .env evaluation-service")
print("  2. Скачай модель: ollama pull llava:7b  (или llama3.2-vision)")
print("  3. Открой решение → нажми 'Запустить оценку' (или оно запустится автоматически при загрузке файлов)")
print("  4. Результат появится через ~30-60 сек (AI score badge в карточке решения)")
print()
print("  Прямой вызов для проверки (пример):")
if s5:
    sid = s5["id"]
    cid = c4["id"] if c4 else 0
    print(f"  curl -X POST http://localhost:8003/evaluation/evaluate \\")
    print(f"    -H 'X-Internal-Secret: cafdgadhffdah' \\")
    print(f"    -H 'Content-Type: application/json' \\")
    print("    -d '{\"submission_id\": " + str(sid) + ", \"contest_id\": " + str(cid) + ",")
    print("         \"tz_text\": \"JWT обязателен, PostgreSQL обязателен, Docker обязателен\",")
    print("         \"submission_text\": \"FastAPI + PostgreSQL + JWT + Docker-compose + pytest 87%\"}'")

print("\n=== Отзывы (avg_score) ===")
print("  Добавлены отзывы customer1 на все 6 решений:")
if s1: print(f"  • submission {s1['id']} (лого TechFlow)   → score=7.5")
if s2: print(f"  • submission {s2['id']} (лого градиент)   → score=8.0")
if s3: print(f"  • submission {s3['id']} (статья ИИ)       → score=9.0  [статус: принята]")
if s4: print(f"  • submission {s4['id']} (баннеры)         → score=6.5")
if s5: print(f"  • submission {s5['id']} (API PASS)        → score=9.5  [статус: принята]")
if s6: print(f"  • submission {s6['id']} (API FAIL)        → score=2.0  [статус: отклонена]")

print("\n=== История статусов ===")
print("  Изменения статусов (для тестирования status log):")
if s3: print(f"  • submission {s3['id']}: 1 → 2 → 3 (принята)")
if s5: print(f"  • submission {s5['id']}: 1 → 2 → 3 (принята)")
if s6: print(f"  • submission {s6['id']}: 1 → 5 (отклонена)")

print("\n=== Конкурсы с этапами ===")
if c1:
    stages_info = " | ".join(
        f"{s['name']}: {s.get('prize_amount', 0)} ₽"
        for s in c1.get("stages", [])
    )
    print(f"  1. 'Логотип для стартапа' id={c1['id']}  [{stages_info}]")
if c3:
    stages_info = " | ".join(
        f"{s['name']}: {s.get('prize_amount', 0)} ₽"
        for s in c3.get("stages", [])
    )
    print(f"  2. 'Баннеры для рекламной кампании' id={c3['id']}  [{stages_info}]")
if c4:
    stages_info = " | ".join(
        f"{s['name']}: {s.get('prize_amount', 0)} ₽"
        for s in c4.get("stages", [])
    )
    print(f"  3. 'REST API для интернет-магазина' id={c4['id']}  [{stages_info}]")

print()
print("  Re-run безопасен: балансы не дублируются, конкурсы не создаются повторно.")
