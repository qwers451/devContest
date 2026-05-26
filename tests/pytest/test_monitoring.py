import os

import httpx
import pytest

MONITORING_URL = os.getenv("PYTEST_MONITORING_URL", "http://localhost:8007")
GATEWAY_URL = os.getenv("PYTEST_GATEWAY_URL", "http://localhost:8080")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "cafdgadhffdah")


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_monitoring_service_snapshot_and_permissions(
    admin_token,
    customer_token,
):
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{MONITORING_URL}/monitoring/health")
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "ok"

        response = await client.get(f"{GATEWAY_URL}/monitoring/docs")
        assert response.status_code == 200, response.text

        response = await client.post(f"{MONITORING_URL}/monitoring/check-runs")
        assert response.status_code == 401, response.text

        response = await client.get(
            f"{MONITORING_URL}/monitoring/check-runs/latest",
            headers=auth_headers(customer_token),
        )
        assert response.status_code == 403, response.text

        response = await client.post(
            f"{MONITORING_URL}/monitoring/check-runs",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 201, response.text
        run = response.json()

        assert run["service_count"] == len(run["services"])
        assert run["healthy_count"] + run["unhealthy_count"] == run["service_count"]

        services = {service["service_name"]: service for service in run["services"]}
        expected_services = {
            "user-service",
            "contest-service",
            "evaluation-service",
            "payment-service",
            "protocol-service",
            "audit-service",
            "monitoring-service",
        }
        assert expected_services.issubset(services.keys())

        for service_name in expected_services:
            assert services[service_name]["status"] == "healthy"
            assert services[service_name]["latency_ms"] >= 0

        response = await client.get(
            f"{MONITORING_URL}/monitoring/check-runs/latest",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200, response.text
        latest_run = response.json()
        assert latest_run["id"] == run["id"]

        response = await client.get(
            f"{MONITORING_URL}/monitoring/check-runs/{run['id']}",
            headers={"x-internal-secret": INTERNAL_SECRET},
        )
        assert response.status_code == 200, response.text
        assert response.json()["id"] == run["id"]

        response = await client.get(
            f"{MONITORING_URL}/monitoring/services/latest",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200, response.text
        latest_services = response.json()
        assert latest_services["id"] == run["id"]
        assert latest_services["service_count"] == len(latest_services["services"])

        response = await client.get(
            f"{MONITORING_URL}/monitoring/services/protocol-service/history",
            params={"limit": 5},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200, response.text
        history = response.json()
        assert history
        assert history[0]["run_id"] == run["id"]
        assert history[0]["service_name"] == "protocol-service"

        response = await client.get(
            f"{MONITORING_URL}/monitoring/services/unknown-service/history",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 404, response.text

        response = await client.get(
            f"{GATEWAY_URL}/monitoring/check-runs/latest",
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 200, response.text
