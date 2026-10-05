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


def test_demo_tracker_isolated_by_session():
    from uuid import uuid4

    from app.perception.demo import demo_observation

    first_session, second_session = str(uuid4()), str(uuid4())
    first = demo_observation("blocked", session_id=first_session).objects[0]
    second = demo_observation("blocked", session_id=second_session).objects[0]
    assert first.track_id == second.track_id == 1


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


def test_navigation_guidance_requires_accurate_fix_and_deduplicates_threshold():
    from app.navigation.guidance import guidance_event
    from app.navigation.service import MockRoutingProvider
    from app.schemas.models import LocationFix

    route = MockRoutingProvider().get_route((12.9716, 77.5946), (12.9750, 77.6050))
    turn = route.instructions[0].maneuver_location
    assert turn is not None
    announced = set()
    inaccurate = LocationFix(lat=turn[1] - 0.001, lon=turn[0], accuracy_m=80)
    assert guidance_event(route, inaccurate, announced) is None
    fix = LocationFix(lat=turn[1] - 0.004, lon=turn[0], accuracy_m=5, simulated=True)
    event = guidance_event(route, fix, announced)
    assert event is not None
    assert event.category == "turn_instruction"
    assert event.simulated is True
    assert guidance_event(route, fix, announced) is None


def test_object_voice_waits_for_persistent_detection_and_does_not_claim_signal_state():
    from types import SimpleNamespace
    from app.communication.audio_events import object_events

    light = DetectedObject(class_name="traffic light", confidence=.9,
                           bbox=BoundingBox(x1=.4, y1=.2, x2=.6, y2=.5), track_id=3)
    session = SimpleNamespace(object_track_streaks={}, announced_audio_keys=set())
    obs = _obs([light])
    assert object_events(session, obs) == []
    events = object_events(session, obs)
    assert len(events) == 1
    assert "signal state is not assessed" in events[0].text
    assert object_events(session, obs) == []


def test_navigation_progress_uses_route_geometry_and_announces_once():
    from app.navigation.guidance import navigation_update
    from app.navigation.service import MockRoutingProvider
    from app.storage.sessions import SessionState
    from app.schemas.models import LocationFix

    route = MockRoutingProvider().get_route((12.9716, 77.5946), (12.975, 77.605))
    session = SessionState(session_id="progress", navigation_active=True, navigation_status="active")
    origin = LocationFix(lat=12.9717, lon=77.5946, accuracy_m=5, simulated=True)
    events, deviated = navigation_update(session, route, origin)
    assert not deviated
    assert session.navigation_next_distance_m is not None
    first = [event for event in events if event.category == "turn_instruction"]
    assert len(first) == 1
    assert "500 meters" in first[0].text

    events, _ = navigation_update(session, route, origin)
    assert not [event for event in events if event.category == "turn_instruction"]


def test_route_deviation_requires_three_accurate_fixes():
    from app.navigation.guidance import navigation_update
    from app.navigation.service import MockRoutingProvider
    from app.storage.sessions import SessionState
    from app.schemas.models import LocationFix

    route = MockRoutingProvider().get_route((12.9716, 77.5946), (12.975, 77.605))
    session = SessionState(session_id="deviation", navigation_active=True, navigation_status="active")
    off_route = LocationFix(lat=12.99, lon=77.62, accuracy_m=5, simulated=True)
    assert navigation_update(session, route, off_route)[1] is False
    assert navigation_update(session, route, off_route)[1] is False
    assert navigation_update(session, route, off_route)[1] is True


def test_audio_event_queue_payload_has_expiry_and_priority():
    from app.communication.audio_events import hazard_audio
    from app.schemas.models import HazardEvent

    hazard = HazardEvent(classification="possible_obstacle", priority="high", reasoning="object detected")
    event = hazard_audio(hazard, "Pause and check.")
    assert event is not None
    assert event.priority == 1
    assert event.expires_after_ms > 0
