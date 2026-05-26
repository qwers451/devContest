from __future__ import annotations

import threading
from uuid import uuid4

import httpx

from research.config import PROTOCOL_URL
from research.scenario_generator.bootstrap import (
    StackContext,
    bootstrap,
    create_submission,
)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


_SHARED_STACK: dict | None = None
_SHARED_STACK_LOCK = threading.Lock()


def prepare_stack(timeout: float = 30.0) -> dict:
    global _SHARED_STACK
    with _SHARED_STACK_LOCK:
        if _SHARED_STACK is not None:
            return _SHARED_STACK

        with httpx.Client(timeout=timeout) as client:
            stack: StackContext = bootstrap(client)
            submission = create_submission(
                client,
                contest_id=stack.contest_id,
                executor_token=stack.executor.token,
                index=0,
            )
            r = client.post(
                f"{PROTOCOL_URL}/protocols/sessions",
                json={
                    "submission_id": submission["id"],
                    "stage_id": stack.stage_ids[0] if stack.stage_ids else None,
                    "command_id": f"load-session-{uuid4().hex}",
                },
                headers=_auth(stack.customer.token),
            )
            r.raise_for_status()
            session = r.json()
            client.post(
                f"{PROTOCOL_URL}/protocols/sessions/{session['id']}/actions/start",
                json={"command_id": f"load-start-{uuid4().hex}"},
                headers=_auth(stack.customer.token),
            ).raise_for_status()
            _SHARED_STACK = {
                "admin_token": stack.admin.token,
                "customer_token": stack.customer.token,
                "executor_token": stack.executor.token,
                "contest_id": stack.contest_id,
                "session_id": session["id"],
                "submission_id": submission["id"],
                "spec_version_id": session["current_spec_version"]["id"],
            }
            return _SHARED_STACK
