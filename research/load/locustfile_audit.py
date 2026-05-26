from __future__ import annotations

from uuid import uuid4

from locust import HttpUser, between, task

from research.config import INTERNAL_SECRET
from research.load.setup import prepare_stack


_STATE: dict | None = None


def _state() -> dict:
    global _STATE
    if _STATE is None:
        _STATE = prepare_stack()
    return _STATE


class AuditUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self) -> None:
        self.state = _state()
        self.customer_token = self.state["customer_token"]
        self.session_id = self.state["session_id"]
        self.submission_id = self.state["submission_id"]
        self.internal_headers = {"x-internal-secret": INTERNAL_SECRET}

    def _auth(self) -> dict:
        return {"Authorization": f"Bearer {self.customer_token}"}

    @task(5)
    def write_event(self) -> None:
        self.client.post(
            "/internal/audit/events",
            headers=self.internal_headers,
            json={
                "command_id": f"load-audit-{uuid4().hex}",
                "service_name": "protocol-service",
                "session_id": self.session_id,
                "submission_id": self.submission_id,
                "event_type": "message.info",
                "payload": {"content": "load-test"},
            },
            name="POST /internal/audit/events",
        )

    @task(2)
    def read_timeline(self) -> None:
        self.client.get(
            "/audit/events",
            params={"session_id": self.session_id},
            headers=self._auth(),
            name="GET /audit/events",
        )
