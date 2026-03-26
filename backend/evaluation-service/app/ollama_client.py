import json

import httpx

from app.config import settings

_EXTRACT_PROMPT = """Ты — эксперт по техническим заданиям. Извлеки все конкретные и проверяемые требования из технического задания.

Правила:
- Извлекай только конкретные требования (не пересказывай общее описание).
- Каждое требование — одно чёткое условие.
- Отмечай ключевые требования флагом is_critical: true.

Техническое задание:
{tz_text}

Ответь ТОЛЬКО валидным JSON-объектом (никакого текста вне JSON):
{{
  "requirements": [
    {{"text": "текст требования", "is_critical": false}},
    ...
  ]
}}"""

_EVALUATE_PROMPT = """Ты — эксперт по оценке конкурсных работ. Проверь работу исполнителя по списку требований.

Оценка за каждое требование:
  100 — требование явно выполнено
   50 — выполнено частично или сложно проверить
    0 — требование не выполнено

Правила:
- Комментарий — одна фраза на русском языке: что именно есть или чего нет в работе.
- critical_issues = true если хотя бы одно требование с is_critical: true имеет score = 0.

Пример:
Требования: [{{"text": "Логотип в шапке страницы", "is_critical": true}}]
Работа: "Сайт-портфолио. В шапке размещён логотип компании и навигация."
Ответ: {{"requirements": [{{"text": "Логотип в шапке страницы", "score": 100, "comment": "Логотип присутствует в шапке"}}], "critical_issues": false}}

Требования:
{requirements_json}

Работа исполнителя:
{submission_text}

Ответь ТОЛЬКО валидным JSON-объектом (никакого текста вне JSON):
{{
  "requirements": [
    {{"text": "текст требования", "score": 100, "comment": "краткий комментарий на русском"}},
    ...
  ],
  "critical_issues": <true или false>
}}"""

_EVALUATE_VISION_PROMPT = """Ты — эксперт по оценке конкурсных работ. Проверь работу исполнителя по списку требований.
Анализируй описание работы, метаданные файлов И прикреплённые изображения.

Оценка за каждое требование:
  100 — требование явно выполнено
   50 — выполнено частично или сложно проверить
    0 — требование не выполнено

Для требований к размерам — используй метаданные файлов (точные пиксели).
Для требований к цветам, стилю, визуальным элементам — смотри на изображения.
Комментарий — одна фраза на русском языке.
critical_issues = true если хотя бы одно требование с is_critical: true имеет score = 0.

Пример:
Требования: [{{"text": "Размер баннера 1920×1080 пикселей", "is_critical": true}}]
Работа: "banner.png: 1920×1080 px, 245 КБ"
Ответ: {{"requirements": [{{"text": "Размер баннера 1920×1080 пикселей", "score": 100, "comment": "Размер точно соответствует требованию"}}], "critical_issues": false}}

Требования:
{requirements_json}

Описание работы и метаданные файлов:
{submission_text}

Ответь ТОЛЬКО валидным JSON-объектом (никакого текста вне JSON):
{{
  "requirements": [
    {{"text": "текст требования", "score": 100, "comment": "краткий комментарий на русском"}},
    ...
  ],
  "critical_issues": <true или false>
}}"""


def _stub_requirements() -> list[dict]:
    return [
        {"text": "Stub: требование 1", "is_critical": True},
        {"text": "Stub: требование 2", "is_critical": False},
        {"text": "Stub: требование 3", "is_critical": False},
    ]


def _stub_result(requirements: list[dict] | None = None) -> dict:
    extracted_reqs = requirements or _stub_requirements()
    passed = []
    failed = []
    details = []

    for index, requirement in enumerate(extracted_reqs):
        text = requirement.get("text", "")
        is_critical = bool(requirement.get("is_critical"))
        if index < 2:
            score = 100
            comment = "Stub: требование выполнено"
            passed.append(text)
        else:
            score = 0
            comment = "Stub: требование не выполнено"
            failed.append(text)
        details.append(
            {
                "text": text,
                "score": score,
                "comment": comment,
                "is_critical": is_critical,
            }
        )

    return {
        "passed_requirements": passed,
        "failed_requirements": failed or ["Stub: требование 3 не выполнено"],
        "requirements_detail": details,
        "compliance_score": 67,
        "critical_issues": False,
    }


async def _generate(
    prompt: str, images: list[str] | None = None, model: str | None = None
) -> str:
    payload: dict = {
        "model": model or settings.ollama_model,
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


def _parse_json(raw: str) -> dict | None:
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned[cleaned.index("\n") + 1 :] if "\n" in cleaned else cleaned
            if cleaned.rstrip().endswith("```"):
                cleaned = cleaned.rstrip()[:-3].rstrip()
        start = cleaned.index("{")
        end = cleaned.rindex("}") + 1
        return json.loads(cleaned[start:end])
    except (ValueError, json.JSONDecodeError):
        return None


def _format_image_meta(image_meta: list[dict]) -> str:
    lines = []
    for m in image_meta:
        fname = m.get("filename", "unknown")
        w, h = m.get("width"), m.get("height")
        size_kb = (m.get("size_bytes") or 0) // 1024
        dims = f"{w}×{h} px" if w and h else "неизвестные размеры"
        lines.append(f"- {fname}: {dims}, {size_kb} КБ")
    return "\n".join(lines)


def _build_result(data: dict, extracted_reqs: list[dict]) -> dict:
    reqs = data.get("requirements", [])
    if not reqs:
        return {
            "passed_requirements": [],
            "failed_requirements": ["Модель не смогла оценить требования"],
            "compliance_score": 0,
            "critical_issues": True,
        }

    critical_flags = [r.get("is_critical", False) for r in extracted_reqs]

    passed = []
    failed = []
    requirements_detail = []
    weighted_sum = 0
    weight_total = 0
    has_critical_fail = False

    for i, r in enumerate(reqs):
        text = r.get("text", "")
        score = r.get("score", 0)
        comment = r.get("comment", "")

        is_critical = critical_flags[i] if i < len(critical_flags) else False
        weight = 2 if is_critical else 1
        weighted_sum += weight * score
        weight_total += weight

        if is_critical and score == 0:
            has_critical_fail = True

        requirements_detail.append(
            {
                "text": text,
                "score": score,
                "comment": comment,
                "is_critical": is_critical,
            }
        )

        if score >= 70:
            passed.append(text if not comment else f"{text} — {comment}")
        else:
            label = "частично" if score == 50 else "не выполнено"
            failed.append(f"{text} — {comment or label}")

    compliance_score = round(weighted_sum / weight_total) if weight_total else 0

    return {
        "passed_requirements": passed,
        "failed_requirements": failed,
        "requirements_detail": requirements_detail,
        "compliance_score": compliance_score,
        "critical_issues": has_critical_fail
        or data.get("critical_issues", compliance_score < 50),
    }


async def extract_tz_requirements(tz_text: str) -> list[dict] | None:
    """Извлекает требования из ТЗ через LLM. Возвращает None при ошибке."""
    if settings.evaluation_stub:
        return _stub_requirements()
    try:
        raw = await _generate(
            _EXTRACT_PROMPT.format(tz_text=tz_text),
            model=settings.ollama_model,
        )
    except httpx.HTTPError:
        return _stub_requirements()
    data = _parse_json(raw)
    if not data or not data.get("requirements"):
        return _stub_requirements()
    return data["requirements"]


async def evaluate_submission(
    tz_text: str,
    submission_text: str,
    images: list[str] | None = None,
    image_meta: list[dict] | None = None,
    cached_requirements: list[dict] | None = None,
) -> dict:
    if settings.evaluation_stub:
        return _stub_result(cached_requirements)

    if cached_requirements:
        extracted_reqs = cached_requirements
    else:
        extracted_reqs = await extract_tz_requirements(tz_text)
        if not extracted_reqs:
            return _stub_result()

    requirements_json = json.dumps(extracted_reqs, ensure_ascii=False, indent=2)

    if images:
        meta_section = (
            f"\n\nМетаданные прикреплённых изображений:\n{_format_image_meta(image_meta)}"
            if image_meta
            else ""
        )
        prompt = _EVALUATE_VISION_PROMPT.format(
            requirements_json=requirements_json,
            submission_text=(submission_text or "(описание отсутствует)")
            + meta_section,
        )
        try:
            eval_raw = await _generate(
                prompt, images=images, model=settings.ollama_vision_model
            )
        except httpx.HTTPError:
            return _stub_result(extracted_reqs)
    else:
        prompt = _EVALUATE_PROMPT.format(
            requirements_json=requirements_json,
            submission_text=submission_text or "(описание отсутствует)",
        )
        try:
            eval_raw = await _generate(prompt, model=settings.ollama_model)
        except httpx.HTTPError:
            return _stub_result(extracted_reqs)

    eval_data = _parse_json(eval_raw)
    if not eval_data:
        return _stub_result(extracted_reqs)

    return _build_result(eval_data, extracted_reqs)
