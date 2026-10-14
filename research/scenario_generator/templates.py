from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Beat:
    actor: str
    action: str
    hints: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ScenarioTemplate:
    code: str
    title: str
    description: str
    beats: tuple[Beat, ...]
    is_conflict: bool = False


S1_SMOOTH = ScenarioTemplate(
    code="S1",
    title="Гладкая сессия",
    description=(
        "ТЗ согласован, работа принята с первого раза."
    ),
    beats=(
        Beat("customer", "start"),
        Beat("customer", "add_requirement", {"is_critical": True}),
        Beat("customer", "add_requirement", {"is_critical": False}),
        Beat("customer", "info"),
        Beat("executor", "clarification", {"link_requirement": True}),
        Beat("customer", "info"),
        Beat("executor", "info"),
        Beat("customer", "clarification", {"link_requirement": True}),
        Beat("executor", "info"),
        Beat("executor", "submission"),
        Beat("customer", "accept"),
    ),
)


S2_RENEGOTIATE = ScenarioTemplate(
    code="S2",
    title="Пересогласование ТЗ",
    description=(
        "В середине сессии заказчик добавляет требование, создаётся "
        "новая SpecVersion, согласование."
    ),
    beats=(
        Beat("customer", "start"),
        Beat("customer", "add_requirement", {"is_critical": True}),
        Beat("executor", "clarification", {"link_requirement": True}),
        Beat("customer", "info"),
        Beat("executor", "info"),
        Beat("customer", "scope_change"),
        Beat("executor", "approve_scope"),
        Beat("executor", "info"),
        Beat("customer", "clarification", {"link_requirement": True}),
        Beat("executor", "submission"),
        Beat("customer", "accept"),
    ),
)


S3_REWORK = ScenarioTemplate(
    code="S3",
    title="Доработка",
    description=(
        "Первая сдача отклонена, исполнитель возвращается к работе и "
        "сдаёт повторно."
    ),
    beats=(
        Beat("customer", "start"),
        Beat("customer", "add_requirement", {"is_critical": True}),
        Beat("executor", "clarification", {"link_requirement": True}),
        Beat("customer", "info"),
        Beat("executor", "submission"),
        Beat("customer", "defect", {"link_requirement": True}),
        Beat("executor", "info"),
        Beat("executor", "clarification", {"link_requirement": True}),
        Beat("customer", "info"),
        Beat("executor", "submission"),
        Beat("customer", "accept"),
    ),
)


S4_DISPUTE = ScenarioTemplate(
    code="S4",
    title="Спор",
    description=(
        "Стороны не сходятся в оценке выполнения; несколько доработок "
        "и финальная отмена со стороны заказчика."
    ),
    is_conflict=True,
    beats=(
        Beat("customer", "start"),
        Beat("customer", "add_requirement", {"is_critical": True}),
        Beat("customer", "add_requirement", {"is_critical": False}),
        Beat("executor", "clarification", {"link_requirement": True}),
        Beat("customer", "info"),
        Beat("executor", "submission"),
        Beat("customer", "defect", {"link_requirement": True}),
        Beat("executor", "info"),
        Beat("executor", "submission"),
        Beat("customer", "defect", {"link_requirement": True}),
        Beat("executor", "info"),
        Beat("customer", "cancel"),
    ),
)


S5_SCOPE_CREEP = ScenarioTemplate(
    code="S5",
    title="Scope creep",
    description=(
        "Заказчик пытается добавить требования в свободных сообщениях "
        "без создания SpecVersion. Подсистема обязана зафиксировать, "
        "что у таких сообщений нет link-а на SpecVersion/Requirement."
    ),
    beats=(
        Beat("customer", "start"),
        Beat("customer", "add_requirement", {"is_critical": True}),
        Beat("executor", "clarification", {"link_requirement": True}),
        Beat("customer", "info", {"scope_creep": True}),
        Beat("customer", "info", {"scope_creep": True}),
        Beat("executor", "info"),
        Beat("customer", "info", {"scope_creep": True}),
        Beat("executor", "info"),
        Beat("customer", "scope_change"),
        Beat("executor", "approve_scope"),
        Beat("executor", "submission"),
        Beat("customer", "accept"),
    ),
)


S6_CANCEL_BY_EXECUTOR = ScenarioTemplate(
    code="S6",
    title="Отмена со стороны исполнителя",
    description=(
        "Исполнитель ведёт переговоры, инициирует scope_change для "
        "пересмотра ТЗ, затем после нескольких итераций без сдачи "
        "просит заказчика закрыть сессию (cancel). Класс «отмена со "
        "стороны исполнителя» — конфликтный сценарий, дополняющий S4."
    ),
    is_conflict=True,
    beats=(
        Beat("customer", "start"),
        Beat("customer", "add_requirement", {"is_critical": True}),
        Beat("customer", "add_requirement", {"is_critical": False}),
        Beat("executor", "clarification", {"link_requirement": True}),
        Beat("customer", "info"),
        Beat("executor", "scope_change"),
        Beat("customer", "approve_scope"),
        Beat("executor", "info"),
        Beat("executor", "clarification", {"link_requirement": True}),
        Beat("customer", "info"),
        Beat("executor", "info"),
        Beat("customer", "cancel"),
    ),
)


TEMPLATES: tuple[ScenarioTemplate, ...] = (
    S1_SMOOTH,
    S2_RENEGOTIATE,
    S3_REWORK,
    S4_DISPUTE,
    S5_SCOPE_CREEP,
    S6_CANCEL_BY_EXECUTOR,
)


def get_template(code: str) -> ScenarioTemplate:
    for template in TEMPLATES:
        if template.code == code:
            return template
    raise KeyError(code)
