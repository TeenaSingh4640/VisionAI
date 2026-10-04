from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.perception.engine import MockPerception, PerceptionEngine, reset_perception_engine_for_tests


@pytest.fixture
def client():
    engine = PerceptionEngine.__new__(PerceptionEngine)
    engine.mode = "mock"
    engine.backend = MockPerception()
    reset_perception_engine_for_tests(engine)
    with TestClient(app) as c:
        yield c
    reset_perception_engine_for_tests(None)


def _start(client: TestClient):
    res = client.post("/api/session/start", json={"destination": "Park gate", "demo_mode": True})
    assert res.status_code == 200
    return res.json()["session_id"]


def test_session_isolation(client: TestClient):
    a = _start(client)
    b = _start(client)
    assert a != b
    client.post("/api/demo/scene", json={"session_id": a, "scene": "blocked"})
    sa = client.get(f"/api/session/{a}/state").json()
    sb = client.get(f"/api/session/{b}/state").json()
    assert sa["session_id"] == a
    assert sb["latest_observation"] is None


def test_clear_scene_skips_route_tool(client: TestClient):
    sid = _start(client)
    res = client.post("/api/demo/scene", json={"session_id": sid, "scene": "clear"}).json()
    tools = [a.get("tool") for a in res["activity"]]
    assert "navigation.get_alternative" not in tools
    assert res["hazard"]["classification"] == "none"


def test_blocked_scene_queries_route(client: TestClient):
    sid = _start(client)
    res = client.post("/api/demo/scene", json={"session_id": sid, "scene": "blocked"}).json()
    tools = [a.get("tool") for a in res["activity"]]
    assert "navigation.get_alternative" in tools
    assert res["hazard"]["classification"] in {"possible_blocked_route", "possible_obstacle"}
    assert res["route"] is not None
    assert res["route"]["is_simulated"] is True


def test_uncertain_scene(client: TestClient):
    sid = _start(client)
    res = client.post("/api/demo/scene", json={"session_id": sid, "scene": "uncertain"}).json()
    assert res["hazard"]["classification"] == "uncertain"
    assert "navigation.get_alternative" not in [a.get("tool") for a in res["activity"]]


def test_routing_failure_not_fabricated(client: TestClient):
    sid = _start(client)
    res = client.post(
        "/api/demo/scene",
        json={"session_id": sid, "scene": "route_failure", "simulate_route_failure": True},
    ).json()
    assert res["route"]["status"] == "error"
    assert res["route"]["geometry"] == []
    assert "could not check" in (res["message"]["text"].lower() if res["message"] else "") or res["route"]["error"]


def test_reassessment_after_clear(client: TestClient):
    sid = _start(client)
    client.post("/api/demo/scene", json={"session_id": sid, "scene": "blocked"})
    res = client.post("/api/demo/scene", json={"session_id": sid, "scene": "obstacle_removed"}).json()
    assert res["hazard"]["classification"] == "none"


def test_websocket_receives_session(client: TestClient):
    sid = _start(client)
    with client.websocket_connect(f"/ws/session/{sid}") as ws:
        message = ws.receive_json()
        assert message["type"] == "session"
        assert message["payload"]["session_id"] == sid


def test_navigation_validation(client: TestClient):
    sid = _start(client)
    res = client.post("/api/navigation/route", json={"session_id": sid}).json()
    assert res["provider"] == "mock"
    assert res["is_simulated"] is True
    assert res["status"] in {"available", "requires_review"}
    fail = client.post("/api/navigation/alternative", json={"session_id": sid, "simulate_failure": True}).json()
    assert fail["status"] == "error"
