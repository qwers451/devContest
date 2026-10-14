from __future__ import annotations

from uuid import uuid4

from locust import HttpUser, between, task

from research.load.setup import prepare_stack


_STATE: dict | None = None


def _state() -> dict:
    global _STATE
    if _STATE is None:
        _STATE = prepare_stack()
    return _STATE


class ProtocolUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self) -> None:
        self.state = _state()
        self.customer_token = self.state["customer_token"]
        self.executor_token = self.state["executor_token"]
        self.session_id = self.state["session_id"]

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    @task(2)
    def create_session_read(self) -> None:
        self.client.get(
            f"/protocols/sessions/{self.session_id}",
            headers=self._auth(self.customer_token),
            name="GET /protocols/sessions/{id}",
        )

    @task(10)
    def post_message(self) -> None:
        self.client.post(
            f"/protocols/sessions/{self.session_id}/messages",
            headers=self._auth(self.executor_token),
            json={
                "command_id": f"load-info-{uuid4().hex}",
                "message_type": "info",
                "content": "Нагрузочное сообщение.",
            },
            name="POST /protocols/sessions/{id}/messages",
        )

    @task(1)
    def advance_state(self) -> None:
        self.client.get(
            f"/protocols/sessions/{self.session_id}/structure-report",
            headers=self._auth(self.customer_token),
            name="GET /protocols/sessions/{id}/structure-report",
        )

    @task(5)
    def get_session(self) -> None:
        self.client.get(
            f"/protocols/sessions/{self.session_id}/messages",
            headers=self._auth(self.customer_token),
            name="GET /protocols/sessions/{id}/messages",
        )
