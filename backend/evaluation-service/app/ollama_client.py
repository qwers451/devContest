import json
import httpx
from app.config import settings

EXTRACT_PROMPT = """You are a requirements analyst. Extract all formal, verifiable requirements from the technical specification below.
Return ONLY a valid JSON array of strings. Each string is one requirement. Do not explain.

Technical specification:
{tz_text}

JSON array:"""

EVALUATE_PROMPT = """You are a quality evaluator. Check if the submitted work meets each requirement.

Requirements:
{requirements}

Submitted work:
{submission_text}

Return ONLY a valid JSON object with this exact structure:
{{
  "passed_requirements": ["requirement text", ...],
  "failed_requirements": ["requirement text", ...],
  "compliance_score": <integer 0-100>,
  "critical_issues": <true or false>
}}"""


async def _generate(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/generate",
            json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
        return resp.json()["response"]


async def extract_requirements(tz_text: str) -> list[str]:
    prompt = EXTRACT_PROMPT.format(tz_text=tz_text)
    raw = await _generate(prompt)
    try:
        start = raw.index("[")
        end = raw.rindex("]") + 1
        return json.loads(raw[start:end])
    except (ValueError, json.JSONDecodeError):
        return []


async def evaluate_submission(requirements: list[str], submission_text: str) -> dict:
    req_text = "\n".join(f"- {r}" for r in requirements)
    prompt = EVALUATE_PROMPT.format(requirements=req_text, submission_text=submission_text)
    raw = await _generate(prompt)
    try:
        start = raw.index("{")
        end = raw.rindex("}") + 1
        return json.loads(raw[start:end])
    except (ValueError, json.JSONDecodeError):
        return {
            "passed_requirements": [],
            "failed_requirements": requirements,
            "compliance_score": 0,
            "critical_issues": True,
        }
