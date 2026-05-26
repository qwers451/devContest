from __future__ import annotations

from locust import HttpUser, between, task


class MonitoringUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(10)
    def health(self) -> None:
        self.client.get("/monitoring/health", name="GET /monitoring/health")
