import asyncio
import json

import httpx

from app.config import settings

# ==========================================
# МОДЕЛИ ДЛЯ РОУТИНГА
# ==========================================
TEXT_MODEL = "qwen2.5-coder:32b"  # Умная модель для парсинга ТЗ и жесткого аудита кода
VISION_MODEL = (
    "pixtral:12b"  # Мультимодальная модель для проверки верстки по скриншотам
)

# ==========================================
# ШАГ 1: ПРОМПТ ДЛЯ ИЗВЛЕЧЕНИЯ ТРЕБОВАНИЙ
# ==========================================
_EXTRACT_PROMPT = """Ты — эксперт-аналитик. Твоя задача: детально проанализировать техническое задание и извлечь из него АБСОЛЮТНО ВСЕ конкретные, проверяемые требования.

Правила:
- Выделяй только конкретные, измеримые требования (без воды).
- Каждое требование должно быть коротким, самодостаточным предложением.
- Дроби сложные абзацы на отдельные пункты.
- ВАЖНО: Требований может быть 10, 20 и более. Выпиши их ВСЕ до единого, ничего не обобщай и не сокращай список!

Техническое задание:
{tz_text}

Ответь ТОЛЬКО валидным JSON-объектом (никакого текста вне JSON):
{{
  "requirements": [
    "первое требование",
    "второе требование",
    "третье требование",
    "четвертое требование",
    "пятое требование",
    "..."
  ]
}}"""

# ==========================================
# ШАГ 2: ПРОМПТЫ ДЛЯ ОЦЕНКИ
# ==========================================
_EVALUATE_PROMPT = """Ты — безжалостный и предельно строгий IT-аудитор. Твоя задача:
Проверить каждое требование из предоставленного списка по описанию работы исполнителя.

Оценка за каждое требование:
  100 — требование выполнено ИДЕАЛЬНО и ПОЛНОСТЬЮ.
   50 — выполнено лишь частично.
    0 — требование НЕ выполнено, нарушено или вообще НЕ УПОМИНАЕТСЯ в работе.

КРИТИЧЕСКИЕ ПРАВИЛА (ШТРАФЫ):
1. Если в ТЗ требуется конкретный инструмент (например, FastAPI), а автор использовал другой (например, Flask) — СТАВЬ 0.
2. Если автор не упоминает реализацию какой-то фичи (например, пользователей нет в описании) — СТАВЬ 0. Не додумывай за автора!
3. Верни результат для КАЖДОГО переданного требования.
4. Комментарий должен быть ОДНОЙ короткой, логичной фразой на русском языке, объясняющей причину оценки.

Список требований для проверки:
{requirements_json}

Работа исполнителя:
{submission_text}

Ответь ТОЛЬКО валидным JSON-объектом:
{{
  "results": [
    {{"text": "текст требования", "score": 0, "comment": "краткая причина оценки"}}
  ]
}}"""

_EVALUATE_VISION_PROMPT = """Ты — строгий эксперт по оценке технических заданий. Твоя задача:
Проверить каждое требование из списка по описанию работы И по прикреплённым изображениям.

Оценка за каждое требование:
  100 — требование явно выполнено
   50 — выполнено частично (или есть мелкие недочеты)
    0 — требование НЕ выполнено, проигнорировано или нарушено

ВАЖНОЕ ПРАВИЛО: Верни результат для КАЖДОГО переданного требования. Количество элементов в массиве `results` должно СТРОГО совпадать с количеством требований. Если в работе или на фото нет явного подтверждения, ставь score: 0.
- Для требований к размерам изображений — используй метаданные файлов.
- Комментарий должен объяснять оценку одной короткой фразой на русском языке.

Список требований для проверки:
{requirements_json}

Описание работы и метаданные файлов:
{submission_text}

Ответь ТОЛЬКО валидным JSON-объектом:
{{
  "results": [
    {{"text": "текст требования", "score": 100, "comment": "краткий комментарий"}}
  ]
}}"""


# ==========================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ==========================================
async def _generate(
    prompt: str, model_name: str, images: list[str] | None = None
) -> str:
    """Вызов Ollama API с ДИНАМИЧЕСКИМ выбором модели."""
    payload: dict = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "options": {"num_ctx": 16384},
    }
    if images:
        payload["images"] = images

    async with httpx.AsyncClient(timeout=600.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/generate",
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()["response"]


def _format_image_meta(image_meta: list[dict]) -> str:
    lines = []
    for m in image_meta:
        fname = m.get("filename", "unknown")
        w, h = m.get("width"), m.get("height")
        size_kb = (m.get("size_bytes") or 0) // 1024
        dims = f"{w}×{h} px" if w and h else "неизвестные размеры"
        lines.append(f"- {fname}: {dims}, {size_kb} КБ")
    return "\n".join(lines)


def _extract_json_from_raw(raw: str) -> dict:
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned[cleaned.index("\n") + 1 :] if "\n" in cleaned else cleaned
            if cleaned.rstrip().endswith("```"):
                cleaned = cleaned.rstrip()[:-3].rstrip()

        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1

        if start == -1 or end == 0:
            return {}

        return json.loads(cleaned[start:end])
    except (ValueError, json.JSONDecodeError):
        return {}


def _parse_evaluation_result(data: dict, raw_fallback: str) -> dict:
    if not data or "results" not in data:
        return {
            "passed_requirements": [],
            "failed_requirements": [
                f"Ошибка разбора ответа оценки: {raw_fallback[:200]}"
            ],
            "compliance_score": 0,
            "critical_issues": True,
        }

    results = data.get("results", [])
    passed, failed, scores = [], [], []
    has_critical_issue = False

    for r in results:
        text = r.get("text", "")
        score = r.get("score", 0)
        comment = r.get("comment", "")
        scores.append(score)

        if score >= 70:
            passed.append(text if not comment else f"{text} — {comment}")
        else:
            label = "частично" if score == 50 else "не выполнено"
            failed.append(f"{text} — {comment or label}")

        # Строгая логика Python: если модель поставила 0, это критическая проблема
        if score == 0:
            has_critical_issue = True

    compliance_score = round(sum(scores) / len(scores)) if scores else 0

    return {
        "passed_requirements": passed,
        "failed_requirements": failed,
        "compliance_score": compliance_score,
        "critical_issues": has_critical_issue,
    }


# ==========================================
# ОСНОВНЫЕ МЕТОДЫ
# ==========================================
async def extract_requirements(tz_text: str) -> list[str]:
    """Шаг 1: Извлечение списка требований из ТЗ (всегда использует TEXT_MODEL)."""
    if not tz_text or not tz_text.strip():
        return []

    prompt = _EXTRACT_PROMPT.format(tz_text=tz_text)
    raw = await _generate(prompt, model_name=TEXT_MODEL)
    data = _extract_json_from_raw(raw)

    reqs = data.get("requirements", [])
    print(f"==== ШАГ 1: Извлечено требований ({TEXT_MODEL}): {len(reqs)} ====")

    return reqs


async def evaluate_submission(
    tz_text: str,
    submission_text: str,
    images: list[str] | None = None,
    image_meta: list[dict] | None = None,
) -> dict:
    """Шаг 1 & 2: Извлечение требований и оценка работы батчами с динамическим роутингом."""

    if settings.evaluation_stub:
        return {
            "passed_requirements": [
                "Stub: требование 1 выполнено",
                "Stub: требование 2 выполнено",
            ],
            "failed_requirements": ["Stub: требование 3 не выполнено"],
            "compliance_score": 67,
            "critical_issues": False,
        }

    # Шаг 1: Извлекаем все требования (текстовой моделью)
    requirements = await extract_requirements(tz_text)

    if not requirements:
        return {
            "passed_requirements": [],
            "failed_requirements": [
                "Модель не смогла извлечь требования из ТЗ (или ТЗ пустое)"
            ],
            "compliance_score": 0,
            "critical_issues": True,
        }

    # Вспомогательная функция для оценки одного чанка (группы требований)
    async def _evaluate_chunk(chunk: list[str]) -> tuple[dict, str]:
        reqs_json_str = json.dumps(chunk, ensure_ascii=False, indent=2)

        if images:
            # ЕСЛИ ЕСТЬ КАРТИНКИ -> отправляем в VISION_MODEL
            meta_section = (
                f"\n\nМетаданные прикреплённых изображений:\n{_format_image_meta(image_meta)}"
                if image_meta
                else ""
            )
            prompt = _EVALUATE_VISION_PROMPT.format(
                requirements_json=reqs_json_str,
                submission_text=(submission_text or "(описание отсутствует)")
                + meta_section,
            )
            raw_eval = await _generate(prompt, model_name=VISION_MODEL, images=images)
        else:
            # ЕСЛИ ТОЛЬКО КОД/ТЕКСТ -> отправляем в TEXT_MODEL
            prompt = _EVALUATE_PROMPT.format(
                requirements_json=reqs_json_str,
                submission_text=submission_text or "(описание отсутствует)",
            )
            raw_eval = await _generate(prompt, model_name=TEXT_MODEL)

        return _extract_json_from_raw(raw_eval), raw_eval

    # Шаг 2: Разбиваем требования на чанки (по 4 штуки)
    CHUNK_SIZE = 4
    chunks = [
        requirements[i : i + CHUNK_SIZE]
        for i in range(0, len(requirements), CHUNK_SIZE)
    ]

    # Запускаем оценку чанков параллельно
    tasks = [_evaluate_chunk(chunk) for chunk in chunks]
    chunk_results = await asyncio.gather(*tasks)

    # Шаг 3: Склеиваем результаты воедино
    merged_data = {"results": []}
    raw_responses_fallback = ""

    for eval_data, raw_eval in chunk_results:
        raw_responses_fallback += raw_eval + "\n---\n"

        if "results" in eval_data and isinstance(eval_data["results"], list):
            merged_data["results"].extend(eval_data["results"])

    # Шаг 4: Парсим итоговый склеенный объект
    return _parse_evaluation_result(merged_data, raw_responses_fallback)
