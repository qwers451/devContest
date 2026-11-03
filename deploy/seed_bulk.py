"""Массовые демо-данные поверх seed.py: ~55 пользователей, ~110 конкурсов, ~500 решений,
отзывы, ИИ-баллы, призовые выплаты, переписки и история за последний год.

Всё создаётся через API (как в seed.py), затем временные метки сдвигаются SQL-запросами
в контейнерах БД. Генерация детерминирована (random.Random(SEED)).

    python3 deploy/seed_bulk.py        # после seed.py, из корня репозитория
"""

import json
import os
import random
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

USER_API = os.getenv("SEED_USER_URL", "http://127.0.0.1:8001")
CONTEST_API = os.getenv("SEED_CONTEST_URL", "http://127.0.0.1:8002")
PAYMENT_API = os.getenv("SEED_PAYMENT_URL", "http://127.0.0.1:8004")
INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASSWORD = "test1234"
SEED = 20261103

rnd = random.Random(SEED)
NOW = datetime.now(timezone.utc)

DB_CONTEST = ("contest-db", "contest_svc", "contest_db")
DB_PAYMENT = ("payment-db", "payment_svc", "payment_db")
DB_USER = ("user-db", "user_svc", "user_db")


# ── HTTP / SQL ──────────────────────────────────────────────────────────────

def request(method, url, data=None, token=None, internal=False):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if internal:
        headers["X-Internal-Secret"] = INTERNAL_SECRET
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {"detail": e.reason}


def run_sql(db, sql):
    service, user, name = db
    proc = subprocess.run(
        ["docker", "compose", "exec", "-T", service, "psql", "-U", user, "-d", name,
         "-v", "ON_ERROR_STOP=1", "-q"],
        input=sql.encode("utf-8"), capture_output=True, cwd=REPO_DIR,
    )
    if proc.returncode != 0:
        print(f"  SQL ({service}) ошибка: {proc.stderr.decode('utf-8', 'replace').strip()[:500]}")
        return False
    return True


def ts(dt):
    return f"'{dt.isoformat()}'::timestamptz"


def login_or_register(login, role, password=PASSWORD):
    st, r = request("POST", f"{USER_API}/auth/login", {"login": login, "password": password})
    if st != 200:
        st, r = request("POST", f"{USER_API}/auth/register",
                        {"email": f"{login.replace('.', '_')}@demo-mail.ru", "login": login,
                         "password": password, "role": role})
    if st not in (200, 201):
        print(f"  {login}: {st} {r}")
        return None
    return {"login": login, "token": r["access_token"], "id": r["user"]["id"], "role": role}


# ── Справочники ─────────────────────────────────────────────────────────────

FIRST = ["anna", "dmitry", "elena", "sergey", "olga", "maxim", "irina", "pavel", "natalia", "artem",
         "maria", "igor", "ksenia", "roman", "yulia", "nikita", "daria", "alexey", "vera", "kirill",
         "polina", "egor", "sofia", "denis", "alina", "timur", "ekaterina", "andrey", "marina", "ilya",
         "valeria", "gleb", "tatiana", "vlad", "milana", "stepan", "lidia", "fedor", "eva", "oleg"]
LAST = ["ivanova", "petrov", "smirnova", "kuznetsov", "sokolova", "popov", "lebedeva", "kozlov",
        "novikova", "morozov", "volkova", "solovyev", "vasilieva", "zaitsev", "pavlova", "semenov",
        "golubeva", "vinogradov", "bogdanova", "vorobyev", "fedorova", "mikhailov", "belova", "tarasov",
        "belyaeva", "komarov", "orlova", "kiselev", "makarova", "andreev"]
SUFFIX = ["", "_design", "_dev", ".art", "_pro", "_studio", ".code", "_ux", ".pixel", "_writer"]

COMPANIES = ["ООО «Вектор»", "Студия «Сфера»", "ИП Белова", "«ГринЛайн»", "«Технопарк Север»",
             "Агентство «Пульс»", "«Медиаформат»", "«Альфа-Логистик»", "«Кофейня Зерно»", "«ФинТочка»",
             "«EdTech Lab»", "«Ремонт Плюс»", "«Северный ветер»", "«Умный дом 24»"]

NEW_TYPES = ["UX/UI-дизайн", "Иллюстрация", "Нейминг"]

TZ_TAIL = ("\n\nКритические требования:\n- Работа оригинальная, без использования чужих материалов\n"
           "- Исходники передаются вместе с результатом")

# Темы конкурсов по типам: (заголовок, аннотация, описание, ТЗ)
BIZ = [("пекарни «Колос»", "семейная пекарня с тремя точками в спальных районах"),
       ("IT-стартапа «Nimbus»", "облачный сервис для учёта задач небольших команд"),
       ("стоматологии «Улыбка»", "частная клиника с упором на семейную стоматологию"),
       ("барбершопа «Бритва»", "мужская парикмахерская в стиле лофт"),
       ("цветочной студии «Флора»", "доставка авторских букетов по городу"),
       ("школы английского «Speak Up»", "онлайн-занятия для подростков и взрослых"),
       ("эко-фермы «Росток»", "фермерские продукты с доставкой по подписке"),
       ("автосервиса «Гараж 77»", "ремонт и обслуживание японских автомобилей"),
       ("фитнес-клуба «Атлет»", "зал с групповыми программами и бассейном"),
       ("книжного магазина «Переплёт»", "независимый магазин с кафе и лекторием"),
       ("ветклиники «Добрый доктор»", "круглосуточная ветеринарная помощь"),
       ("агентства путешествий «Горизонт»", "авторские туры по России"),
       ("кондитерской «Безе»", "торты на заказ и десерты для кофеен"),
       ("коворкинга «Точка сборки»", "рабочие места и переговорные в центре города"),
       ("бренда одежды «Север»", "функциональная одежда для городской жизни"),
       ("сервиса аренды самокатов «Ветер»", "городской прокат электросамокатов"),
       ("детского центра «Совёнок»", "развивающие занятия для детей 3–10 лет"),
       ("юридической фирмы «Статус»", "сопровождение малого и среднего бизнеса"),
       ("пивоварни «Хмель и солод»", "крафтовая пивоварня с дегустационным залом"),
       ("маркетплейса «Мастерица»", "площадка товаров ручной работы")]

TYPE_SPECS = {
    "Логотип": dict(
        titles=["Логотип для {b}", "Ребрендинг логотипа {b}", "Фирменный знак для {b}"],
        tz="Требования:\n1. Логотип в векторе (SVG, PDF) и растре (PNG 512/1024 px)\n"
           "2. Версии для светлого и тёмного фона, монохромная версия\n"
           "3. Читаемость в размере 32 px\n4. Подобранные шрифт и палитра (HEX/CMYK)",
        prize=(8000, 40000),
        subs=["Знак-монограмма", "Минималистичный линейный знак", "Геометрический логотип",
              "Шрифтовой логотип", "Эмблема в винтажном стиле", "Знак с негативным пространством",
              "Комбинированный логотип", "Логотип-маскот", "Абстрактный символ"],
        sub_desc="{v}: {n} концепции, финальная версия в SVG и PNG, светлый и тёмный фон, "
                 "мини-гайд по применению на {p} страницах."),
    "Статья": dict(
        titles=["Статья для блога {b}", "Экспертный лонгрид для {b}", "Серия постов для {b}"],
        tz="Требования:\n1. Объём 3000–5000 знаков без пробелов\n2. Не менее 3 источников\n"
           "3. Структура: заголовок, лид, подзаголовки, вывод\n4. Уникальность от 90%",
        prize=(3000, 15000),
        subs=["Практическое руководство", "Статья-чек-лист", "Разбор кейса", "Интервью с экспертом",
              "Обзор рынка", "История бренда", "Статья в формате вопросов и ответов", "Колонка от лица основателя"],
        sub_desc="{v}: около {n}000 знаков, {p} источников, подзаголовки и иллюстрации, "
                 "уникальность 94% по Text.ru."),
    "Баннер": dict(
        titles=["Баннеры для рекламной кампании {b}", "Набор баннеров для соцсетей {b}",
                "Наружная реклама для {b}"],
        tz="Требования:\n1. Размеры 1080x1080, 1080x1920, 728x90, 300x250\n2. Читаемый оффер и CTA\n"
           "3. Фирменные цвета заказчика\n4. Исходники в Figma или PSD",
        prize=(5000, 25000),
        subs=["Комплект «Яркий акцент»", "Минималистичная серия", "Баннеры с фотоколлажем",
              "Иллюстрированная серия", "Анимированные баннеры", "Серия с крупной типографикой"],
        sub_desc="{v}: {n} размеров, вариант с анимацией CTA, исходники в Figma, "
                 "проверено на читаемость на {p} площадках."),
    "Иконка": dict(
        titles=["Набор иконок для приложения {b}", "Иконки для сайта {b}", "Пиктограммы навигации для {b}"],
        tz="Требования:\n1. Не менее 20 иконок в едином стиле\n2. Сетка 24 px, SVG\n"
           "3. Активное и неактивное состояние\n4. Читаемость на размере 16 px",
        prize=(5000, 20000),
        subs=["Линейный набор", "Плоские иконки с акцентом", "Объёмные иконки", "Набор в стиле glyph",
              "Двухцветные иконки", "Скруглённый набор"],
        sub_desc="{v}: {n}0 иконок, сетка 24 px, SVG и PNG, светлая и тёмная тема, "
                 "{p} дополнительных иконок бонусом."),
    "Веб-разработка": dict(
        titles=["Лендинг для {b}", "Сайт-визитка для {b}", "Личный кабинет клиента для {b}",
                "Интернет-магазин для {b}", "Telegram-бот для {b}"],
        tz="Требования:\n1. Адаптивная вёрстка (360–1920 px)\n2. Lighthouse Performance не ниже 85\n"
           "3. Форма заявки с валидацией\n4. Инструкция по развёртыванию, Docker приветствуется",
        prize=(15000, 80000),
        subs=["Реализация на React + Vite", "Сайт на Next.js", "Вёрстка на Astro", "Решение на Vue 3",
              "Бэкенд на FastAPI + фронт на React", "Решение на Django", "Лёгкая вёрстка без фреймворков"],
        sub_desc="{v}: адаптивная вёрстка, Lighthouse {n}5, форма с валидацией, Docker-compose, "
                 "покрытие тестами {p}0%."),
    "UX/UI-дизайн": dict(
        titles=["Дизайн мобильного приложения {b}", "Редизайн сайта {b}", "UI-кит для {b}"],
        tz="Требования:\n1. Макеты в Figma: мобильная и десктопная версии\n2. Компоненты и стили в UI-ките\n"
           "3. Кликабельный прототип основных сценариев\n4. Соответствие WCAG AA по контрасту",
        prize=(15000, 60000),
        subs=["Светлая чистая концепция", "Тёмная тема с акцентами", "Концепция в стиле neo-brutalism",
              "Мягкий дружелюбный интерфейс", "Строгая корпоративная концепция"],
        sub_desc="{v}: {n} экранов, UI-кит из {p}0 компонентов, кликабельный прототип, "
                 "проверка контраста по WCAG AA."),
    "Иллюстрация": dict(
        titles=["Иллюстрации для сайта {b}", "Персонаж-маскот для {b}", "Иллюстрации для упаковки {b}"],
        tz="Требования:\n1. Серия из 5–8 иллюстраций в едином стиле\n2. Вектор (SVG/AI) и PNG\n"
           "3. Адаптация под светлый и тёмный фон",
        prize=(7000, 30000),
        subs=["Плоская векторная серия", "Акварельная стилизация", "Иллюстрации в изометрии",
              "Серия с персонажем", "Графика в технике линогравюры"],
        sub_desc="{v}: {n} иллюстраций, исходники в AI и SVG, версии для тёмного фона, "
                 "{p} эскиза на выбор."),
    "Нейминг": dict(
        titles=["Название и слоган для {b}", "Нейминг новой линейки {b}", "Слоган для рекламной кампании {b}"],
        tz="Требования:\n1. Не менее 10 вариантов названия\n2. Проверка свободных доменов .ru/.com\n"
           "3. Короткое обоснование каждого варианта",
        prize=(3000, 12000),
        subs=["Короткие звучные названия", "Названия-метафоры", "Игра слов", "Латиница и кириллица",
              "Названия от ключевой ценности"],
        sub_desc="{v}: {n}2 варианта, проверка доменов, обоснование и {p} слоганов к лучшим названиям."),
}

REVIEW_TEXT = {
    "high": ["Отличная работа, полностью закрывает ТЗ.", "Очень сильное решение, приятно работать.",
             "Сделано с запасом: и по качеству, и по срокам.", "Лучшее из присланного, берём в работу.",
             "Аккуратно, продуманно, с вниманием к деталям."],
    "mid": ["Хорошо, но есть что доработать.", "В целом по ТЗ, не хватило выразительности.",
            "Добротно, но конкуренты предложили интереснее.", "Неплохо, пара требований выполнена частично.",
            "Рабочий вариант, но без изюминки."],
    "low": ["Не соответствует части требований ТЗ.", "Сыровато, нужна серьёзная доработка.",
            "Идея есть, но исполнение слабое.", "Мимо брифа, к сожалению."],
}

CHAT = [
    [("e", "Здравствуйте! Подскажите, есть ли брендбук или фирменные цвета?"),
     ("c", "Добрый день! Брендбука нет, основные цвета — тёмно-синий и белый."),
     ("e", "Понял, учту. Сделаю два варианта палитры на выбор."),
     ("c", "Отлично, спасибо!")],
    [("c", "Добрый день! Решение интересное. Можно ускорить сдачу финальной версии?"),
     ("e", "Здравствуйте! Да, смогу прислать финал до конца недели."),
     ("c", "Супер. И добавьте, пожалуйста, исходники."),
     ("e", "Конечно, приложу архив с исходниками к решению."),
     ("e", "Готово, обновил решение.")],
    [("e", "Здравствуйте! Уточните, пожалуйста, целевая аудитория — B2B или B2C?"),
     ("c", "В основном B2C, люди 25–40 лет."),
     ("e", "Спасибо, тогда сделаю тон чуть неформальнее."),
     ("c", "Да, это то, что нужно."),
     ("e", "Загрузил новую версию, посмотрите, когда будет время."),
     ("c", "Посмотрел, стало заметно лучше!")],
    [("c", "Здравствуйте! Видел ваше решение. Есть ли адаптация под мобильные?"),
     ("e", "Добрый день! Да, проверял на 360 px и на планшетах."),
     ("c", "Хорошо. А тёмная тема предусмотрена?"),
     ("e", "Пока нет, но могу добавить за пару дней."),
     ("c", "Будет здорово, ждём.")],
]


def skill_score(skill, spread=1.2):
    s = 3.0 + skill * 7.0 + rnd.gauss(0, spread)
    return max(1.0, min(10.0, round(s * 2) / 2))


def review_text(score):
    band = "high" if score >= 8.5 else "mid" if score >= 6 else "low"
    return rnd.choice(REVIEW_TEXT[band])


# ── 1. Пользователи и типы ──────────────────────────────────────────────────

def main():
    print("=== Массовые демо-данные ===")
    admin = login_or_register("admin", "admin", "admin123")
    if not admin:
        sys.exit("нет admin — сначала запустите seed.py")

    st, types = request("GET", f"{CONTEST_API}/contest-types")
    type_ids = {t["name"]: t["id"] for t in types}
    for name in NEW_TYPES:
        if name not in type_ids:
            st, t = request("POST", f"{CONTEST_API}/contest-types", {"name": name}, admin["token"])
            if st == 201:
                type_ids[name] = t["id"]
    type_names = [n for n in TYPE_SPECS if n in type_ids]

    logins = set()
    while len(logins) < 56:
        logins.add(rnd.choice(FIRST) + "." + rnd.choice(LAST)[:rnd.randint(4, 9)] + rnd.choice(SUFFIX))
    logins = sorted(logins)
    rnd.shuffle(logins)

    customers, executors = [], []
    print("  пользователи...")
    for i, login in enumerate(logins):
        role = "customer" if i < 14 else "executor"
        u = login_or_register(login, role)
        if not u:
            continue
        u["age"] = rnd.randint(60, 360) if role == "customer" else rnd.randint(20, 360)
        if role == "customer":
            u["company"] = COMPANIES[i % len(COMPANIES)]
            customers.append(u)
        else:
            u["skill"] = rnd.betavariate(4, 2.2)
            u["types"] = set(rnd.sample(type_names, rnd.randint(2, 4)))
            executors.append(u)
    for u in customers:
        request("POST", f"{PAYMENT_API}/wallet/internal/credit",
                {"user_id": u["id"], "amount": 2_000_000, "description": "Пополнение кошелька"}, internal=True)
    for u in executors:
        request("POST", f"{PAYMENT_API}/wallet/internal/credit",
                {"user_id": u["id"], "amount": rnd.choice([1000, 2000, 3000, 5000]),
                 "description": "Пополнение кошелька"}, internal=True)
    print(f"  заказчиков: {len(customers)}, исполнителей: {len(executors)}")

    # ── 2. Конкурсы ─────────────────────────────────────────────────────────
    plan = []        # для SQL: {id, created, selected|None, ends|None}
    chats = []       # для SQL: (conv_id, [(msg_id, dt)])
    n_subs = 0
    used_titles = set()

    kinds = ["finished"] * 70 + ["active"] * 34 + ["cancelled"] * 6
    rnd.shuffle(kinds)
    for idx, kind in enumerate(kinds):
        owner = rnd.choice(customers)
        tname = rnd.choice(type_names)
        spec = TYPE_SPECS[tname]
        for _ in range(20):
            biz, biz_descr = rnd.choice(BIZ)
            title = rnd.choice(spec["titles"]).format(b=biz)
            if title not in used_titles:
                break
        used_titles.add(title)
        lo, hi = spec["prize"]
        prize = int(rnd.randint(lo, hi) / 500) * 500
        distribution = rnd.choice([[100], [100], [60, 30, 10], [50, 30, 20], [70, 30]])
        if kind == "finished":
            created = NOW - timedelta(days=rnd.randint(40, max(45, min(owner["age"] - 5, 330))),
                                      hours=rnd.randint(0, 23))
            ends_hours = 24 * 30
        elif kind == "active":
            created = NOW - timedelta(days=rnd.randint(1, 25), hours=rnd.randint(0, 23))
            ends_hours = rnd.randint(18, 24 * 30)
        else:
            created = NOW - timedelta(days=rnd.randint(20, min(200, owner["age"] - 5)))
            ends_hours = 24 * 30
        body = {
            "title": title,
            "annotation": f"{tname} для {owner['company']}: {biz_descr}",
            "description": (f"{owner['company']} ищет исполнителя. Проект: {biz_descr}. "
                            f"Ждём работы, которые подчеркнут характер бренда и решат задачу бизнеса. "
                            f"Победитель получает приз, остальные участники — развёрнутый отзыв."),
            "tz_text": spec["tz"] + TZ_TAIL,
            "prizepool": prize,
            "ends_at": (NOW + timedelta(hours=ends_hours)).isoformat(),
            "type_id": type_ids[tname],
            "prize_distribution": distribution,
        }
        st, c = request("POST", f"{CONTEST_API}/contests", body, owner["token"])
        if st != 201:
            print(f"  конкурс «{title}» → {st} {c}")
            continue
        cid = c["id"]
        if kind == "cancelled":
            request("PATCH", f"{CONTEST_API}/contests/{cid}/cancel-internal", internal=True)
            plan.append({"id": cid, "created": created, "selected": None, "ends": None})
            continue
        st, r = request("POST", f"{PAYMENT_API}/payments/topup",
                        {"contest_id": cid, "amount": prize, "use_balance": True}, owner["token"])
        if st not in (200, 201, 409):
            print(f"  оплата {cid} → {st} {r}")
            continue
        # Конкурс активируется асинхронно после оплаты
        for _ in range(40):
            st, cur = request("GET", f"{CONTEST_API}/contests/{cid}", token=owner["token"])
            if st == 200 and cur.get("status") == "active":
                break
            time.sleep(0.25)

        # Решения
        pool = [e for e in executors if tname in e["types"]] or executors
        count = rnd.randint(3, 9) if kind == "finished" else rnd.choice([0, 1, 2, 3, 4, 5, 6, 7])
        participants = rnd.sample(pool, min(count, len(pool)))
        made = []
        for j, ex in enumerate(participants):
            variant = rnd.choice(spec["subs"])
            st, sub = request("POST", f"{CONTEST_API}/submissions", {
                "contest_id": cid, "title": variant, "annotation": variant,
                "description": spec["sub_desc"].format(v=variant, n=rnd.randint(2, 9), p=rnd.randint(2, 9)),
            }, ex["token"])
            if st != 201:
                print(f"    решение → {st} {sub}")
                continue
            n_subs += 1
            # Исполнитель зарегистрирован раньше своего первого решения
            ex["age"] = max(ex["age"], (NOW - created).days + 3)
            ai =int(max(15, min(99, 35 + ex["skill"] * 60 + rnd.gauss(0, 8))))
            request("PATCH", f"{CONTEST_API}/submissions/{sub['id']}/ai-score?score={ai}&critical_issues={'true' if ai < 35 else 'false'}",
                    internal=True)
            score = None
            if kind == "finished" or rnd.random() < 0.45:
                score = skill_score(ex["skill"])
                request("POST", f"{CONTEST_API}/submissions/{sub['id']}/reviews",
                        {"score": score, "commentary": review_text(score)}, owner["token"])
            made.append((sub, ex, score or 0))

        selected = ends = None
        if kind == "finished" and made:
            ranked = sorted(made, key=lambda m: -m[2])
            awards = [{"submission_id": s["id"], "place": p + 1}
                      for p, (s, _, _) in enumerate(ranked[:len(distribution)])]
            st, r = request("POST", f"{CONTEST_API}/contests/{cid}/awards", {"awards": awards}, owner["token"])
            if st == 200:
                done_after = rnd.randint(10, 30)
                selected = created + timedelta(days=done_after, hours=rnd.randint(1, 8))
                ends = created + timedelta(days=done_after - 2)
            else:
                print(f"    награды {cid} → {st} {r}")
            for s, _, sc in ranked[len(distribution):]:
                if sc and sc < 6 and rnd.random() < 0.6:
                    request("PATCH", f"{CONTEST_API}/submissions/{s['id']}/status?status=5", token=owner["token"])
        elif kind == "active":
            for s, _, sc in made:
                if sc and sc >= 8:
                    request("PATCH", f"{CONTEST_API}/submissions/{s['id']}/status?status=2", token=owner["token"])

        plan.append({"id": cid, "created": created, "selected": selected, "ends": ends})

        # Переписки: в части активных и недавно завершённых конкурсов
        if made and rnd.random() < (0.5 if kind == "active" else 0.15):
            _, ex, _ = rnd.choice(made)
            st, conv = request("POST", f"{CONTEST_API}/chat/conversations",
                               {"contest_id": cid, "executor_id": ex["id"]}, owner["token"])
            if st == 200:
                script = rnd.choice(CHAT)
                start = (NOW - timedelta(hours=rnd.randint(2, 24 * 6))) if kind == "active" \
                    else (created + timedelta(days=rnd.randint(2, 6)))
                msgs = []
                for k, (who, text) in enumerate(script):
                    tok = owner["token"] if who == "c" else ex["token"]
                    st, m = request("POST", f"{CONTEST_API}/chat/conversations/{conv['id']}/messages",
                                    {"text": text}, tok)
                    if st == 201:
                        msgs.append((m["id"], min(start + timedelta(minutes=17 * k + rnd.randint(0, 40)),
                                                  NOW - timedelta(minutes=5))))
                for tok in (owner["token"], ex["token"]):
                    request("POST", f"{CONTEST_API}/chat/conversations/{conv['id']}/read", None, tok)
                chats.append((conv["id"], msgs))

        if (idx + 1) % 10 == 0:
            print(f"  конкурсов: {idx + 1}/{len(kinds)}, решений: {n_subs}")

    # ── 3. История (SQL) ────────────────────────────────────────────────────
    print("  правка временных меток...")
    csql, psql = [], []
    for p in plan:
        cid, c = p["id"], ts(p["created"])
        win_end = ts(p["ends"]) if p["ends"] else "now()"
        sub_ts = f"{c} + (LEAST({win_end}, now()) - {c}) * (0.1 + 0.15 * (id % 6))"
        rev_ts = ("LEAST((SELECT created_at FROM submissions s WHERE s.id = reviews.submission_id)"
                  " + interval '1 day' + (id % 6) * interval '3 hours', now() - interval '1 hour')")
        ends_sql = f", ends_at = {ts(p['ends'])}" if p["ends"] else ""
        csql.append(f"""
UPDATE contests SET created_at = {c}{ends_sql} WHERE id = {cid};
UPDATE submissions SET created_at = {sub_ts}, updated_at = {sub_ts} WHERE contest_id = {cid};
UPDATE reviews SET created_at = {rev_ts}, updated_at = {rev_ts}
  WHERE submission_id IN (SELECT id FROM submissions WHERE contest_id = {cid});
UPDATE submission_status_logs SET changed_at = LEAST(
    (SELECT created_at FROM submissions s WHERE s.id = submission_status_logs.submission_id) + interval '2 days',
    now() - interval '1 hour')
  WHERE submission_id IN (SELECT id FROM submissions WHERE contest_id = {cid});""")
        s = ts(p["selected"]) if p["selected"] else "NULL"
        if p["selected"]:
            csql.append(f"""
UPDATE winners SET selected_at = {s} WHERE contest_id = {cid};
UPDATE contest_awards SET created_at = {s} WHERE contest_id = {cid};
UPDATE submissions SET updated_at = {s}
  WHERE id IN (SELECT submission_id FROM contest_awards WHERE contest_id = {cid});""")
        paid = ts(p["created"] + timedelta(minutes=5))
        later = f"COALESCE({s}, {paid})"
        psql.append(f"""
UPDATE payments SET created_at = {c}, paid_at = {paid}, updated_at = {later} WHERE contest_id = {cid};
UPDATE escrow_accounts SET released_at = {s} WHERE contest_id = {cid} AND released_at IS NOT NULL;
UPDATE award_releases SET released_at = {s}
  WHERE escrow_id IN (SELECT id FROM escrow_accounts WHERE contest_id = {cid});
UPDATE transactions SET created_at = CASE WHEN type = 'hold' THEN {paid} ELSE {later} END
  WHERE payment_id IN (SELECT id FROM payments WHERE contest_id = {cid});
UPDATE payouts SET created_at = {later}, paid_at = {later} WHERE contest_id = {cid};
UPDATE wallet_transactions SET created_at = CASE WHEN tx_type = 'contest_payment' THEN {paid} ELSE {later} END
  WHERE reference_id = {cid} AND tx_type IN ('contest_payment', 'income');""")

    for conv_id, msgs in chats:
        if not msgs:
            continue
        for mid, dt in msgs:
            csql.append(f"UPDATE chat_messages SET created_at = {ts(dt)}, "
                        f"read_at = CASE WHEN read_at IS NULL THEN NULL ELSE {ts(dt + timedelta(minutes=12))} END "
                        f"WHERE id = {mid};")
        csql.append(f"UPDATE conversations SET created_at = {ts(msgs[0][1])}, "
                    f"last_message_at = {ts(msgs[-1][1])} WHERE id = {conv_id};")

    usql = []
    for u in customers + executors:
        reg = NOW - timedelta(days=u["age"], hours=rnd.randint(0, 23))
        usql.append(f"UPDATE users SET created_at = {ts(reg)} WHERE id = {u['id']};")
        psql.append(f"UPDATE wallet_transactions SET created_at = {ts(reg + timedelta(hours=2))} "
                    f"WHERE user_id = {u['id']} AND tx_type = 'topup';")
    ok = run_sql(DB_CONTEST, "\n".join(csql)) & run_sql(DB_PAYMENT, "\n".join(psql)) & run_sql(DB_USER, "\n".join(usql))
    print(f"  готово: конкурсов {len(plan)}, решений {n_subs}, переписок {len(chats)}, SQL {'ок' if ok else 'с ошибками'}")


if __name__ == "__main__":
    main()
