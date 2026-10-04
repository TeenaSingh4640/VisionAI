from __future__ import annotations

from uuid import uuid4

from app.schemas.models import AudioEvent, HazardEvent, Observation, utc_now


def object_events(session, observation: Observation) -> list[AudioEvent]:
    """Announce sustained, useful detections once per tracker identity."""
    present: set[str] = set()
    output: list[AudioEvent] = []
    if observation.quality != "ok":
        session.object_track_streaks.clear()
        return output
    for obj in observation.objects:
        if obj.confidence < 0.45:
            continue
        track = str(obj.track_id if obj.track_id is not None else f"{obj.class_name}:{round(obj.bbox.x1, 1)}:{round(obj.bbox.y1, 1)}")
        key = f"object:{track}:{obj.class_name.lower()}"
        present.add(key)
        session.object_track_streaks[key] = session.object_track_streaks.get(key, 0) + 1
        if session.object_track_streaks[key] < 2 or key in session.announced_audio_keys:
            continue
        session.announced_audio_keys.add(key)
        name = obj.class_name.replace("_", " ")
        if name.lower() == "traffic light":
            phrase = "Traffic light detected; signal state is not assessed."
        else:
            center = (obj.bbox.x1 + obj.bbox.x2) / 2
            place = "to your left" if center < 0.38 else "to your right" if center > 0.62 else "ahead"
            phrase = f"{name} detected {place}."
        output.append(AudioEvent(
            event_id=str(uuid4()), source="object_detection", category="object_announcement", priority=4,
            text=phrase, created_at=utc_now(), expires_after_ms=8_000, deduplication_key=key,
            simulated=observation.source in {"demo", "mock"},
        ))
    for key in list(session.object_track_streaks):
        if key not in present:
            session.object_track_streaks.pop(key, None)
    return output


def hazard_audio(hazard: HazardEvent | None, text: str | None, simulated: bool = False) -> AudioEvent | None:
    if not hazard or not text:
        return None
    category = "hazard_alert" if hazard.classification not in {"none", "uncertain"} else "system_alert"
    priority = 1 if hazard.priority == "high" else 2 if category == "hazard_alert" else 3
    return AudioEvent(
        event_id=str(uuid4()), source="system", category=category, priority=priority,
        text=text, created_at=utc_now(), expires_after_ms=15_000,
        deduplication_key=f"hazard:{hazard.classification}:{text[:72]}", simulated=simulated,
    )
