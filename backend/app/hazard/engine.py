from __future__ import annotations

from collections import defaultdict

from app.schemas.models import DetectedObject, HazardEvent, Observation

OBSTRUCTION_CLASSES = {"motorcycle", "bicycle", "car", "bus", "truck", "bench", "chair"}
MOVING_CLASSES = {"person", "bicycle", "motorcycle"}


def _center(obj: DetectedObject) -> tuple[float, float]:
    return ((obj.bbox.x1 + obj.bbox.x2) / 2, (obj.bbox.y1 + obj.bbox.y2) / 2)


def _area(obj: DetectedObject) -> float:
    return max(0.0, obj.bbox.x2 - obj.bbox.x1) * max(0.0, obj.bbox.y2 - obj.bbox.y1)


def _in_path_region(obj: DetectedObject) -> bool:
    cx, cy = _center(obj)
    return 0.22 <= cx <= 0.78 and cy >= 0.38


class HazardEngine:
    """Deterministic, conservative heuristics. No monocular distance claims."""

    def __init__(self) -> None:
        self.persistence: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))

    def assess(self, session_id: str, observation: Observation, route_active: bool) -> HazardEvent:
        if observation.quality in {"low", "blurry", "dark", "conflicting"}:
            return HazardEvent(
                classification="uncertain",
                priority="high",
                confidence=0.25,
                uncertainty=0.9,
                reasoning=f"Visual quality is {observation.quality}; path cannot be assessed from this frame.",
                recommended_action="request_observation",
                affecting_route=False,
            )

        confidences = [o.confidence for o in observation.objects]
        if observation.objects and (sum(confidences) / len(confidences)) < 0.35:
            return HazardEvent(
                classification="uncertain",
                priority="medium",
                confidence=0.3,
                uncertainty=0.8,
                reasoning="Detection confidence is too low for a reliable hazard assessment.",
                recommended_action="request_observation",
            )

        path_objects = [o for o in observation.objects if _in_path_region(o) and o.confidence >= 0.4]
        persistent_ids: list[int] = []
        counts = self.persistence[session_id]
        seen_ids: set[int] = set()
        for obj in path_objects:
            if obj.track_id is None:
                continue
            seen_ids.add(obj.track_id)
            counts[obj.track_id] += 1
            if counts[obj.track_id] >= 2:
                persistent_ids.append(obj.track_id)
        for tid in list(counts.keys()):
            if tid not in seen_ids:
                counts[tid] = max(0, counts[tid] - 1)

        blocked = [
            o
            for o in path_objects
            if o.class_name in OBSTRUCTION_CLASSES and _area(o) >= 0.04
        ]
        movers = [o for o in path_objects if o.class_name in MOVING_CLASSES]

        if blocked and persistent_ids:
            ids = [o.track_id for o in blocked if o.track_id in persistent_ids and o.track_id is not None]
            names = sorted({o.class_name for o in blocked})
            return HazardEvent(
                classification="possible_blocked_route" if route_active else "possible_obstacle",
                priority="high",
                confidence=0.72,
                uncertainty=0.45,
                reasoning=(
                    f"Persistent object(s) in the lower-central view ({', '.join(names)}). "
                    "This may obstruct the apparent path. Distance is not measured."
                ),
                recommended_action="query_route" if route_active else "alert_user",
                affecting_route=route_active,
                object_ids=[i for i in ids if i is not None],
            )

        if blocked:
            names = sorted({o.class_name for o in blocked})
            return HazardEvent(
                classification="possible_obstacle",
                priority="medium",
                confidence=0.58,
                uncertainty=0.55,
                reasoning=(
                    f"Possible obstruction in view ({', '.join(names)}). "
                    "Waiting for persistence before treating it as a route conflict."
                ),
                recommended_action="request_observation",
                object_ids=[o.track_id for o in blocked if o.track_id is not None],
            )

        if movers:
            return HazardEvent(
                classification="moving_object_near_path",
                priority="medium",
                confidence=0.5,
                uncertainty=0.6,
                reasoning="A potentially moving object is in the apparent path region. Collision is not predicted.",
                recommended_action="monitor",
                object_ids=[o.track_id for o in movers if o.track_id is not None],
            )

        self.persistence[session_id].clear()
        return HazardEvent(
            classification="none",
            priority="low",
            confidence=0.55,
            uncertainty=0.5,
            reasoning="No relevant obstruction class detected in the apparent path region of this view.",
            recommended_action="monitor",
        )


_hazard = HazardEngine()


def get_hazard_engine() -> HazardEngine:
    return _hazard
