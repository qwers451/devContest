from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal
from uuid import uuid4

import httpx

from research.config import PROTOCOL_URL
from research.scenario_generator.agents import DialogueRNG
from research.scenario_generator.templates import Beat, ScenarioTemplate


def _relaxed_clients_enabled() -> bool:
    return os.getenv("RESEARCH_RELAXED_CLIENTS", "false").strip().lower() == "true"


@dataclass
class SessionRecord:
    session_id: int
    submission_id: int
    template_code: str
    final_state: str
    message_count: int
    spec_versions: int
    requirements: list[int] = field(default_factory=list)
    creep_message_ids: list[int] = field(default_factory=list)
    expected_q1_spec_version_id: int | None = None
    expected_q2_scope_initiator_id: int | None = None
    expected_q3_scope_decider_id: int | None = None


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _cid(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


Actor = Literal["customer", "executor"]


@dataclass
class Driver:
    client: httpx.Client
    customer_token: str
    executor_token: str
    rng: DialogueRNG
    customer_id: int | None = None
    executor_id: int | None = None

    def _token(self, actor: Actor) -> str:
        return self.customer_token if actor == "customer" else self.executor_token

    def _user_id(self, actor: Actor) -> int | None:
        return self.customer_id if actor == "customer" else self.executor_id

    def create_session(self, *, submission_id: int, stage_id: int | None = None) -> dict:
        r = self.client.post(
            f"{PROTOCOL_URL}/protocols/sessions",
            json={
                "submission_id": submission_id,
                "stage_id": stage_id,
                "command_id": _cid("session"),
            },
            headers=_auth(self.customer_token),
        )
        r.raise_for_status()
        return r.json()

    def action(self, *, session_id: int, actor: Actor, name: str) -> dict:
        r = self.client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/actions/{name}",
            json={"command_id": _cid(f"action-{name}")},
            headers=_auth(self._token(actor)),
        )
        r.raise_for_status()
        return r.json()

    def add_requirement(
        self,
        *,
        session_id: int,
        spec_version_id: int,
        is_critical: bool,
    ) -> dict:
        title = self.rng.requirement_title()
        r = self.client.post(
            (
                f"{PROTOCOL_URL}/protocols/sessions/{session_id}"
                f"/spec-versions/{spec_version_id}/requirements"
            ),
            json={
                "command_id": _cid("req"),
                "title": title,
                "description": f"Требование «{title}», эталон для стенда.",
                "is_critical": is_critical,
            },
            headers=_auth(self.customer_token),
        )
        r.raise_for_status()
        return r.json()

    def info(
        self,
        *,
        session_id: int,
        actor: Actor,
        requirement_id: int | None = None,
    ) -> dict:
        text = self.rng.customer_line() if actor == "customer" else self.rng.executor_line()
        return self._message(
            session_id=session_id,
            actor=actor,
            payload={
                "command_id": _cid("info"),
                "message_type": "info",
                "content": text,
                "requirement_id": requirement_id,
            },
        )

    def clarification(
        self,
        *,
        session_id: int,
        actor: Actor,
        requirement_id: int | None = None,
    ) -> dict:
        text = self.rng.customer_line() if actor == "customer" else self.rng.executor_line()
        if _relaxed_clients_enabled():
            requirement_id = None
        return self._message(
            session_id=session_id,
            actor=actor,
            payload={
                "command_id": _cid("clar"),
                "message_type": "clarification",
                "content": f"Уточнение: {text}",
                "requirement_id": requirement_id,
            },
        )

    def scope_change(self, *, session_id: int, actor: Actor) -> dict:
        text = self.rng.scope_change_line()
        payload: dict = {
            "command_id": _cid("scope"),
            "message_type": "scope_change",
            "content": text,
        }
        if _relaxed_clients_enabled():
            pass
        else:
            payload["proposed_tz_text"] = self.rng.tz_text_update()
        return self._message(
            session_id=session_id,
            actor=actor,
            payload=payload,
        )

    def submission(self, *, session_id: int) -> dict:
        return self._message(
            session_id=session_id,
            actor="executor",
            payload={
                "command_id": _cid("sub"),
                "message_type": "submission",
                "content": self.rng.submission_line(),
            },
        )

    def defect(
        self,
        *,
        session_id: int,
        requirement_id: int | None = None,
    ) -> dict:
        if _relaxed_clients_enabled():
            requirement_id = None
        return self._message(
            session_id=session_id,
            actor="customer",
            payload={
                "command_id": _cid("def"),
                "message_type": "defect",
                "content": self.rng.defect_line(),
                "requirement_id": requirement_id,
            },
        )

    def _message(self, *, session_id: int, actor: Actor, payload: dict) -> dict:
        r = self.client.post(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}/messages",
            json=payload,
            headers=_auth(self._token(actor)),
        )
        r.raise_for_status()
        return r.json()

    def session(self, session_id: int) -> dict:
        r = self.client.get(
            f"{PROTOCOL_URL}/protocols/sessions/{session_id}",
            headers=_auth(self.customer_token),
        )
        r.raise_for_status()
        return r.json()


def _target_session_length(rng: DialogueRNG) -> int:
    return 48 + rng.extra_messages(5, 5)


def run_template(
    driver: Driver,
    template: ScenarioTemplate,
    *,
    submission_id: int,
    stage_id: int | None,
) -> SessionRecord:
    session = driver.create_session(submission_id=submission_id, stage_id=stage_id)
    session_id = session["id"]
    current_spec_version_id = session["current_spec_version"]["id"]

    requirements: list[int] = []
    creep_message_ids: list[int] = []
    last_requirement_id: int | None = None
    sent_messages = 0
    expected_q2_initiator: int | None = None
    expected_q3_decider: int | None = None
    seen_first_submission = False

    def _pick_requirement(link: bool) -> int | None:
        if not link or not requirements:
            return None
        return requirements[-1]

    def _extra_chatter(count: int, actor: Actor) -> None:
        nonlocal sent_messages
        for _ in range(count):
            driver.info(session_id=session_id, actor=actor)
            sent_messages += 1

    target_length = _target_session_length(driver.rng)
    non_terminal_beats = max(
        sum(1 for b in template.beats if b.action not in {"accept", "cancel"}),
        1,
    )
    structured_msg_beats = sum(
        1
        for beat in template.beats
        if beat.action in {
            "info",
            "clarification",
            "scope_change",
            "submission",
            "defect",
        }
    )
    chatter_budget = max(target_length - structured_msg_beats, 0)
    base_chatter, remainder = divmod(chatter_budget, non_terminal_beats)
    chatter_index = 0

    for beat in template.beats:
        action = beat.action
        actor: Actor = beat.actor
        hints = beat.hints

        if action == "start":
            driver.action(session_id=session_id, actor=actor, name="start")
        elif action == "add_requirement":
            req = driver.add_requirement(
                session_id=session_id,
                spec_version_id=current_spec_version_id,
                is_critical=bool(hints.get("is_critical", False)),
            )
            requirements.append(req["id"])
            last_requirement_id = req["id"]
            if seen_first_submission and expected_q2_initiator is None:
                expected_q2_initiator = driver._user_id(actor)
        elif action == "info":
            link = hints.get("link_requirement", False)
            msg = driver.info(
                session_id=session_id,
                actor=actor,
                requirement_id=_pick_requirement(link),
            )
            sent_messages += 1
            if hints.get("scope_creep"):
                creep_message_ids.append(msg["id"])
        elif action == "clarification":
            link = hints.get("link_requirement", False)
            driver.clarification(
                session_id=session_id,
                actor=actor,
                requirement_id=_pick_requirement(link),
            )
            sent_messages += 1
        elif action == "scope_change":
            msg = driver.scope_change(session_id=session_id, actor=actor)
            sent_messages += 1
            expected_q2_initiator = (
                msg.get("author_id") if isinstance(msg, dict) else None
            ) or driver._user_id(actor)
            fresh = driver.session(session_id)
            pending = fresh.get("pending_spec_version")
            if pending:
                current_spec_version_id = pending["id"]
        elif action == "approve_scope":
            driver.action(
                session_id=session_id,
                actor=actor,
                name="approve-scope-change",
            )
            expected_q3_decider = driver._user_id(actor)
            fresh = driver.session(session_id)
            current_spec_version_id = fresh["current_spec_version"]["id"]
        elif action == "reject_scope":
            driver.action(
                session_id=session_id,
                actor=actor,
                name="reject-scope-change",
            )
            expected_q3_decider = driver._user_id(actor)
        elif action == "submission":
            driver.submission(session_id=session_id)
            sent_messages += 1
            seen_first_submission = True
        elif action == "defect":
            link = hints.get("link_requirement", False)
            driver.defect(
                session_id=session_id,
                requirement_id=last_requirement_id if link else None,
            )
            sent_messages += 1
        elif action == "accept":
            driver.action(session_id=session_id, actor="customer", name="accept")
        elif action == "cancel":
            driver.action(session_id=session_id, actor="customer", name="cancel")
        else:
            raise ValueError(f"Unknown beat action: {action}")

        if action not in {"accept", "cancel"}:
            this_beat_chatter = base_chatter + (1 if chatter_index < remainder else 0)
            chatter_index += 1
            allowed = max(target_length - sent_messages, 0)
            this_beat_chatter = min(this_beat_chatter, allowed)
            if this_beat_chatter:
                fresh = driver.session(session_id)
                if fresh["current_state"] in {"active", "rework", "negotiation", "review"}:
                    _extra_chatter(
                        this_beat_chatter,
                        actor="executor" if actor == "customer" else "customer",
                    )

    final = driver.session(session_id)
    expected_q1_spec = final.get("current_spec_version_id")
    return SessionRecord(
        session_id=session_id,
        submission_id=submission_id,
        template_code=template.code,
        final_state=final["current_state"],
        message_count=final["message_count"],
        spec_versions=final["spec_version_count"],
        requirements=requirements,
        creep_message_ids=creep_message_ids,
        expected_q1_spec_version_id=expected_q1_spec,
        expected_q2_scope_initiator_id=expected_q2_initiator,
        expected_q3_scope_decider_id=expected_q3_decider,
    )
