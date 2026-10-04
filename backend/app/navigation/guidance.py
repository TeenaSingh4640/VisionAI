from __future__ import annotations

import math
from uuid import uuid4

from app.core.config import get_settings
from app.schemas.models import AudioEvent, LocationFix, RouteResult, utc_now


def distance_m(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    """Great-circle distance in meters."""
    radius = 6_371_000
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    value = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0, 1 - value)))


def guidance_event(route: RouteResult | None, location: LocationFix, announced: set[str]) -> AudioEvent | None:
    if not route or route.status != "available" or location.accuracy_m is None or location.accuracy_m > 50:
        return None
    thresholds = sorted({int(x.strip()) for x in get_settings().turn_thresholds_m.split(",") if x.strip() and int(x.strip()) > 0})
    for index, step in enumerate(route.instructions):
        point = step.maneuver_location
        if not point or len(point) < 2 or step.maneuver_type in {None, "depart", "arrive", "new name", "continue"}:
            continue
        remaining = distance_m(location.lat, location.lon, point[1], point[0])
        for threshold in thresholds:
            key = f"{route.route_id}:{index}:{threshold}"
            if remaining <= threshold and key not in announced:
                announced.add(key)
                direction = step.maneuver_modifier or step.maneuver_type or ""
                direction = direction.replace("_", " ")
                return AudioEvent(
                    event_id=str(uuid4()), source="navigation", category="turn_instruction", priority=3,
                    text=f"Your mapped route indicates {direction} in approximately {threshold} meters. Check your surroundings.",
                    created_at=utc_now(), expires_after_ms=20_000, deduplication_key=key,
                    simulated=route.is_simulated or location.simulated,
                )
    return None
