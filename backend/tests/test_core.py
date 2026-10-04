from __future__ import annotations

from app.hazard.engine import HazardEngine
from app.perception.engine import SimpleIOUTracker
from app.schemas.models import BoundingBox, DetectedObject, Observation, utc_now


def _obs(objects, quality="ok", source="demo"):
    return Observation(
        timestamp=utc_now(),
        frame_id="t",
        objects=objects,
        processing_ms=1,
        source=source,
        quality=quality,
    )


def test_perception_schema_normalized():
    obj = DetectedObject(
        class_name="motorcycle",
        confidence=0.94,
        bbox=BoundingBox(x1=0.56, y1=0.42, x2=0.92, y2=0.91),
        track_id=12,
    )
    payload = _obs([obj]).model_dump()
    assert payload["objects"][0]["bbox"]["x1"] <= 1
    assert payload["objects"][0]["class_name"] == "motorcycle"


def test_tracker_assigns_stable_ids():
    tracker = SimpleIOUTracker()
    a = DetectedObject(class_name="motorcycle", confidence=0.9, bbox=BoundingBox(x1=0.4, y1=0.5, x2=0.7, y2=0.9))
    b = DetectedObject(class_name="motorcycle", confidence=0.91, bbox=BoundingBox(x1=0.41, y1=0.51, x2=0.71, y2=0.91))
    first = tracker.update([a])[0]
    second = tracker.update([b])[0]
    assert first.track_id == second.track_id


def test_hazard_clear_scene():
    engine = HazardEngine()
    hazard = engine.assess("s1", _obs([]), True)
    assert hazard.classification == "none"
    assert hazard.recommended_action == "monitor"


def test_hazard_uncertain():
    engine = HazardEngine()
    hazard = engine.assess("s1", _obs([], quality="dark"), True)
    assert hazard.classification == "uncertain"
    assert hazard.recommended_action == "request_observation"


def test_hazard_persistence_and_route_query():
    engine = HazardEngine()
    moto = DetectedObject(
        class_name="motorcycle",
        confidence=0.94,
        bbox=BoundingBox(x1=0.42, y1=0.48, x2=0.78, y2=0.92),
        track_id=7,
    )
    first = engine.assess("s2", _obs([moto]), True)
    assert first.classification == "possible_obstacle"
    second = engine.assess("s2", _obs([moto]), True)
    assert second.classification == "possible_blocked_route"
    assert second.recommended_action == "query_route"


def test_duplicate_message_suppressed():
    from app.communication.service import CommunicationService
    from app.schemas.models import UserPreferences

    svc = CommunicationService()
    hazard = HazardEngine().assess("s", _obs([], quality="dark"), False)
    msg1, key = svc.build(hazard, None, UserPreferences(), last_key=None)
    msg2, key2 = svc.build(hazard, None, UserPreferences(), last_key=key)
    assert msg1 is not None
    assert msg2 is None
    assert key2 == key
