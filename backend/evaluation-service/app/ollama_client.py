import json

import httpx

from app.config import settings

# Single-step prompt: extract requirements from TZ and evaluate each one.
# Outputs per-requirement scores so compliance_score is computed deterministically in Python.
_EVALUATE_PROMPT = """Ты — эксперт по оценке технических заданий. Твоя задача:
1. Извлечь все конкретные и проверяемые требования из технического задания.
2. Проверить каждое требование по представленной работе и выставить оценку.

Оценка за каждое требование:
  100 — требование явно выполнено
   50 — выполнено частично или сложно проверить
    0 — требование не выполнено

Правила:
- Извлекай только конкретные требования (не пересказывай общее описание).
- Комментарий — одна фраза на русском языке: что именно есть или чего нет в работе.
- compliance_score = среднее арифметическое всех score (целое число 0–100).
- critical_issues = true если хотя бы одно КЛЮЧЕВОЕ требование имеет score = 0.

Техническое задание:
{tz_text}

Работа исполнителя:
{submission_text}

Ответь ТОЛЬКО валидным JSON-объектом (никакого текста вне JSON):
{{
  "requirements": [
    {{"text": "текст требования", "score": 100, "comment": "краткий комментарий на русском"}},
    ...
  ],
  "compliance_score": <целое число 0-100>,
  "critical_issues": <true или false>
}}"""

_EVALUATE_VISION_PROMPT = """Ты — эксперт по оценке технических заданий. Твоя задача:
1. Извлечь все конкретные и проверяемые требования из технического задания.
2. Проверить каждое требование по описанию работы И по прикреплённым изображениям.

Оценка за каждое требование:
  100 — требование явно выполнено
   50 — выполнено частично или сложно проверить
    0 — требование не выполнено

Для требований к размерам изображений — используй метаданные файлов (точные пиксели).
Для требований к цветам, стилю, CTA — смотри на изображения.
Комментарий — одна фраза на русском языке.
compliance_score = среднее арифметическое всех score (целое число 0–100).
critical_issues = true если хотя бы одно КЛЮЧЕВОЕ требование имеет score = 0.

Техническое задание:
{tz_text}

Описание работы и метаданные файлов:
{submission_text}

Ответь ТОЛЬКО валидным JSON-объектом (никакого текста вне JSON):
{{
  "requirements": [
    {{"text": "текст требования", "score": 100, "comment": "краткий комментарий на русском"}},
    ...
  ],
  "compliance_score": <целое число 0-100>,
  "critical_issues": <true или false>
}}"""


async def _generate(prompt: str, images: list[str] | None = None) -> str:
    """Call Ollama API. Pass base64-encoded images for vision evaluation."""
    payload: dict = {
        "model": settings.ollama_model,
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


def _parse_result(raw: str, tz_text: str) -> dict:
    """Parse LLM JSON response into evaluation result dict."""
    try:
        # Strip markdown code fences if model wrapped its answer
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            # Drop the opening fence line (```json or ```)
            cleaned = cleaned[cleaned.index("\n") + 1 :] if "\n" in cleaned else cleaned
            # Drop the closing fence if present
            if cleaned.rstrip().endswith("```"):
                cleaned = cleaned.rstrip()[:-3].rstrip()
        start = cleaned.index("{")
        end = cleaned.rindex("}") + 1
        data = json.loads(cleaned[start:end])
    except (ValueError, json.JSONDecodeError):
        return {
            "passed_requirements": [],
            "failed_requirements": [f"Ошибка разбора ответа модели: {raw[:200]}"],
            "compliance_score": 0,
            "critical_issues": True,
        }

    reqs = data.get("requirements", [])
    if not reqs:
        return {
            "passed_requirements": [],
            "failed_requirements": ["Модель не смогла извлечь требования из ТЗ"],
            "compliance_score": 0,
            "critical_issues": True,
        }

    passed = []
    failed = []
    scores = []

    for r in reqs:
        text = r.get("text", "")
        score = r.get("score", 0)
        comment = r.get("comment", "")
        scores.append(score)

        if score >= 70:
            passed.append(text if not comment else f"{text} — {comment}")
        else:
            label = "частично" if score == 50 else "не выполнено"
            failed.append(f"{text} — {comment or label}")

    # Compute score in Python, ignore LLM's own compliance_score to avoid hallucination
    compliance_score = round(sum(scores) / len(scores)) if scores else 0

    return {
        "passed_requirements": passed,
        "failed_requirements": failed,
        "compliance_score": compliance_score,
        "critical_issues": data.get("critical_issues", compliance_score < 50),
    }


async def evaluate_submission(
    tz_text: str,
    submission_text: str,
    images: list[str] | None = None,
    image_meta: list[dict] | None = None,
) -> dict:
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

    if images:
        meta_section = (
            f"\n\nМетаданные прикреплённых изображений:\n{_format_image_meta(image_meta)}"
            if image_meta
            else ""
        )
        prompt = _EVALUATE_VISION_PROMPT.format(
            tz_text=tz_text,
            submission_text=(submission_text or "(описание отсутствует)")
            + meta_section,
        )
    else:
        prompt = _EVALUATE_PROMPT.format(
            tz_text=tz_text,
            submission_text=submission_text or "(описание отсутствует)",
        )

    raw = await _generate(prompt, images=images or None)
    return _parse_result(raw, tz_text)


# Keep for backward compatibility (not used directly anymore)
async def extract_requirements(tz_text: str) -> list[str]:
    return []
