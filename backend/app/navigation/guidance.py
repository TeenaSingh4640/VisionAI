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


def _project_point(lat: float, lon: float, geometry: list[list[float]]) -> tuple[float, float, float] | None:
    """Return along-route distance, lateral distance, and total route length."""
    if len(geometry) < 2:
        return None
    cumulative = 0.0
    best: tuple[float, float, float] | None = None
    for a, b in zip(geometry, geometry[1:]):
        if len(a) < 2 or len(b) < 2:
            continue
        seg_len = distance_m(a[1], a[0], b[1], b[0])
        if seg_len <= 0:
            continue
        scale_x = 111_320 * math.cos(math.radians(lat))
        ax, ay = (a[0] - lon) * scale_x, (a[1] - lat) * 111_320
        bx, by = (b[0] - lon) * scale_x, (b[1] - lat) * 111_320
        dx, dy = bx - ax, by - ay
        denom = dx * dx + dy * dy
        t = max(0.0, min(1.0, -(ax * dx + ay * dy) / denom)) if denom else 0.0
        lateral = math.hypot(ax + t * dx, ay + t * dy)
        if best is None or lateral < best[1]:
            best = (cumulative + t * seg_len, lateral, 0.0)
        cumulative += seg_len
    if best is None:
        return None
    return best[0], best[1], cumulative


def _route_distance_to_point(lat: float, lon: float, geometry: list[list[float]]) -> float | None:
    projected = _project_point(lat, lon, geometry)
    return projected[0] if projected else None


def navigation_update(session, route: RouteResult | None, location: LocationFix) -> tuple[list[AudioEvent], bool]:
    """Update confirmed navigation from GPS against route geometry; return events and deviation trigger."""
    if not session.navigation_active or not route or route.status != "available":
        return [], False
    if location.accuracy_m is None or location.accuracy_m > 50:
        return [], False
    projected = _project_point(location.lat, location.lon, route.geometry)
    if projected is None:
        return [], False
    progress, lateral, _ = projected
    session.navigation_last_progress_m = progress

    deviation_limit = max(35.0, location.accuracy_m * 2)
    if lateral > deviation_limit:
        session.navigation_deviation_samples += 1
    else:
        session.navigation_deviation_samples = 0
    deviation = session.navigation_deviation_samples >= 3

    events: list[AudioEvent] = []
    thresholds = sorted({int(x.strip()) for x in get_settings().turn_thresholds_m.split(",") if x.strip() and int(x.strip()) > 0})
    maneuver_types = {"depart", "arrive", "new name", "continue", "notification", "use lane"}
    next_instruction = None
    next_index = 0
    next_remaining = None
    for index, step in enumerate(route.instructions):
        if step.maneuver_type in maneuver_types or not step.maneuver_location or len(step.maneuver_location) < 2:
            continue
        distance_along = _route_distance_to_point(step.maneuver_location[1], step.maneuver_location[0], route.geometry)
        if distance_along is None or distance_along < progress - 15:
            continue
        next_instruction, next_index = step, index
        next_remaining = max(0.0, distance_along - progress)
        break

    session.navigation_next_instruction = next_index
    session.navigation_next_distance_m = round(next_remaining) if next_remaining is not None else None
    if next_instruction is None or next_remaining is None:
        if lateral <= deviation_limit and projected[2] - progress <= 20:
            session.navigation_active = False
            session.navigation_status = "arrived"
            events.append(AudioEvent(
                event_id=str(uuid4()), source="navigation", category="route_update", priority=3,
                text="You have reached the destination area. Please verify the exact entrance.",
                created_at=utc_now(), expires_after_ms=20_000,
                deduplication_key=f"arrived:{route.route_id}", simulated=route.is_simulated or location.simulated,
            ))
        return events, deviation

    key_base = f"{route.route_id}:{next_index}"
    direction = (next_instruction.maneuver_modifier or next_instruction.maneuver_type or "").replace("_", " ")
    if next_remaining <= 12:
        key = f"{key_base}:at-turn"
        if key not in session.nav_announced_thresholds:
            session.nav_announced_thresholds.add(key)
            events.append(AudioEvent(
                event_id=str(uuid4()), source="navigation", category="turn_instruction", priority=3,
                text=f"The mapped {direction} is here. Check your surroundings before changing direction.",
                created_at=utc_now(), expires_after_ms=7_000, deduplication_key=key,
                simulated=route.is_simulated or location.simulated,
            ))
    else:
        for threshold in thresholds:
            key = f"{key_base}:{threshold}"
            gps_margin = max(3.0, location.accuracy_m / 2)
            if next_remaining <= threshold + gps_margin and key not in session.nav_announced_thresholds:
                session.nav_announced_thresholds.add(key)
                events.append(AudioEvent(
                    event_id=str(uuid4()), source="navigation", category="turn_instruction", priority=3,
                    text=f"In approximately {threshold} meters, your mapped route indicates {direction}. Check your surroundings.",
                    created_at=utc_now(), expires_after_ms=20_000, deduplication_key=key,
                    simulated=route.is_simulated or location.simulated,
                ))
                break
    return events, deviation
