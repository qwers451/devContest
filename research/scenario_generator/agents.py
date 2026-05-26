from __future__ import annotations

import random
from dataclasses import dataclass

CUSTOMER_PHRASES = (
    "Уточните, пожалуйста, формат финального отчёта.",
    "Важный момент: экспорт должен быть в XLSX.",
    "Пример того, что я хочу получить, пришлю отдельно.",
    "Поясните, какие поля должны быть видимы администратору.",
    "Нужно, чтобы при пересортировке сохранялся фильтр.",
    "Давайте зафиксируем термин «заявка» именно как submission.",
    "Напомню про требование по адаптивной вёрстке.",
    "Уточнение по стилю кнопок: только outlined.",
)

EXECUTOR_PHRASES = (
    "Принял, сделаю экспорт в XLSX на втором этапе.",
    "Беру в работу, отчёт по формату будет в следующей итерации.",
    "Насчёт фильтров — подтверждаю, сохраняем.",
    "Пришлите, пожалуйста, пример кейса с админскими полями.",
    "Ок, адаптив делаю вместе с таблицами.",
    "Готовлю демо-версию для проверки.",
    "По кнопкам уточню нюанс: только outlined, без filled.",
    "Попробую первый драфт к концу дня.",
)

SCOPE_CHANGE_PHRASES = (
    "Нужно добавить отдельный экран истории изменений.",
    "Прошу расширить ТЗ: появился дополнительный отчёт.",
    "Переформулировка: нам потребуется экспорт по датам.",
)

DEFECT_PHRASES = (
    "На экране не видно модального окна экспорта.",
    "При обновлении списка фильтр сбрасывается.",
    "Цвета кнопок не соответствуют макету.",
)

SUBMISSION_PHRASES = (
    "Готова первая итерация, проверьте, пожалуйста.",
    "Собрал финальную сборку, всё по ТЗ.",
    "Отправляю на проверку очередную версию.",
)

REQUIREMENT_TITLES = (
    "Экспорт в XLSX",
    "Сохранение фильтра при сортировке",
    "Админ-панель с ролями",
    "Адаптивная вёрстка таблиц",
    "Контрастные outlined-кнопки",
    "Модальное окно с итогами",
)


@dataclass
class DialogueRNG:
    seed: int

    def __post_init__(self) -> None:
        self._rng = random.Random(self.seed)

    def pick(self, options: tuple[str, ...]) -> str:
        return self._rng.choice(options)

    def customer_line(self) -> str:
        return self.pick(CUSTOMER_PHRASES)

    def executor_line(self) -> str:
        return self.pick(EXECUTOR_PHRASES)

    def submission_line(self) -> str:
        return self.pick(SUBMISSION_PHRASES)

    def defect_line(self) -> str:
        return self.pick(DEFECT_PHRASES)

    def scope_change_line(self) -> str:
        return self.pick(SCOPE_CHANGE_PHRASES)

    def requirement_title(self) -> str:
        return self.pick(REQUIREMENT_TITLES)

    def tz_text_update(self) -> str:
        return (
            "Обновлённое ТЗ: добавляется блок #"
            + str(self._rng.randint(10, 99))
            + " и правки по отчёту."
        )

    def extra_messages(self, base: int, jitter: int = 2) -> int:
        return max(0, base + self._rng.randint(-jitter, jitter))
