"""Почтовые уведомления. Отправка никогда не ломает HTTP-запрос: ошибки только логируются."""

import asyncio
import logging
import smtplib
import time
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from html import escape

from app.clients import get_user
from app.config import settings

logger = logging.getLogger(__name__)

SUBMISSION_STATUS_LABELS = {
    1: "Новое",
    2: "Просмотрено",
    3: "Победитель",
    4: "Необходимы правки",
    5: "Правки внесены",
}

CHAT_EMAIL_INTERVAL = 600  # секунд: не чаще одного письма на беседу и получателя
_chat_last_sent: dict[tuple[int, int], float] = {}


def _send_sync(to: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    name, addr = parseaddr(settings.smtp_from)
    msg["From"] = formataddr((name, addr)) if addr else settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_tls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


async def send_email(to: str | None, subject: str, text: str, html: str) -> None:
    if not settings.smtp_host or not to:
        return
    try:
        await asyncio.to_thread(_send_sync, to, subject, text, html)
    except Exception:
        logger.exception("Failed to send email to %s (%s)", to, subject)


def _render(title: str, lines: list[str], button_text: str, link: str) -> tuple[str, str]:
    text = "\n\n".join([title, *lines, f"{button_text}: {link}", "— devContest"])
    body = "".join(
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#374151">{escape(l)}</p>'
        for l in lines
    )
    html = f"""<!doctype html><html lang="ru"><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#4f46e5;padding:18px 28px;color:#ffffff;font-size:20px;font-weight:bold">devContest</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#111827">{escape(title)}</h1>
{body}
<p style="margin:24px 0 0"><a href="{escape(link, quote=True)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">{escape(button_text)}</a></p>
</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#9ca3af">Это автоматическое уведомление платформы devContest.</td></tr>
</table></td></tr></table></body></html>"""
    return text, html


def _url(path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}{path}"


async def _notify(
    user_id: int, subject: str, title: str, lines: list[str], button: str, path: str
) -> None:
    """Достаёт email пользователя и отправляет письмо. Не бросает исключений."""
    if not settings.smtp_host:
        return
    try:
        user = await get_user(user_id)
        if not user or not user.get("email"):
            return
        text, html = _render(title, lines, button, _url(path))
        await send_email(user["email"], subject, text, html)
    except Exception:
        logger.exception("Failed to notify user %s", user_id)


async def notify_new_submission(
    customer_id: int, contest_title: str, executor_id: int, submission_number: int
) -> None:
    executor = await get_user(executor_id)
    login = (executor or {}).get("login") or f"#{executor_id}"
    await _notify(
        customer_id,
        f"Новая заявка на конкурс «{contest_title}»",
        f"Новая заявка на конкурс «{contest_title}»",
        [f"Исполнитель {login} отправил решение на ваш конкурс «{contest_title}»."],
        "Открыть решение",
        f"/solution/{submission_number}",
    )


async def notify_winner(
    winner_id: int, contest_number: int, contest_title: str, amount: int | float
) -> None:
    await _notify(
        winner_id,
        f"Ваше решение победило в конкурсе «{contest_title}»",
        "Поздравляем с победой!",
        [
            f"Ваше решение победило в конкурсе «{contest_title}».",
            f"На ваш кошелёк зачислено {amount:,.0f} ₽.".replace(",", " "),
        ],
        "Открыть конкурс",
        f"/contest/{contest_number}",
    )


async def notify_contest_finished(
    executor_id: int, contest_number: int, contest_title: str
) -> None:
    await _notify(
        executor_id,
        f"Конкурс «{contest_title}» завершён",
        f"Конкурс «{contest_title}» завершён",
        [
            f"Заказчик выбрал победителя в конкурсе «{contest_title}», в котором вы участвовали.",
            "Спасибо за участие!",
        ],
        "Открыть конкурс",
        f"/contest/{contest_number}",
    )


async def notify_status_changed(
    executor_id: int, submission_number: int, submission_title: str, status: int
) -> None:
    label = SUBMISSION_STATUS_LABELS.get(status, str(status))
    await _notify(
        executor_id,
        "Статус вашего решения изменён",
        "Статус вашего решения изменён",
        [f"Решение «{submission_title}»: новый статус — «{label}»."],
        "Открыть решение",
        f"/solution/{submission_number}",
    )


async def notify_chat_message(
    recipient_id: int,
    sender_id: int,
    conversation_id: int,
    contest_title: str | None,
    message_text: str,
) -> None:
    """Письмо о новом сообщении; не чаще раза в 10 минут на беседу и получателя."""
    if not settings.smtp_host:
        return
    now = time.monotonic()
    key = (conversation_id, recipient_id)
    last = _chat_last_sent.get(key)
    if last is not None and now - last < CHAT_EMAIL_INTERVAL:
        return
    _chat_last_sent[key] = now
    sender = await get_user(sender_id)
    login = (sender or {}).get("login") or f"#{sender_id}"
    preview = message_text if len(message_text) <= 200 else message_text[:200] + "…"
    title_part = f" по конкурсу «{contest_title}»" if contest_title else ""
    await _notify(
        recipient_id,
        f"Новое сообщение от {login}",
        f"Новое сообщение от {login}",
        [f"Вам написал(а) {login}{title_part}:", f"«{preview}»"],
        "Открыть чат",
        "/chat",
    )
