from __future__ import annotations

from app.schemas.models import CommunicationMessage, HazardEvent, RouteResult, UserPreferences

TEMPLATES = {
    "clear": "The path appears clear based on the current view. Continue carefully. This is not a safety guarantee.",
    "obstacle": "A possible obstruction is ahead. Please pause.",
    "obstacle_route": "A possible obstruction is ahead. Please pause while I check the mapped route.",
    "moving": "A pedestrian or moving object is in view. Please wait for the scene to settle.",
    "uncertain": "I cannot clearly assess the path ahead. Please pause and check your surroundings.",
    "alt_route": "The mapped path may be blocked. An alternative route is available for review.",
    "route_fail": "I could not check an alternative route. Please pause and use your usual navigation method.",
    "camera": "The camera is unavailable. Visual assistance is paused.",
    "route_ok": "Mapped route information is available for review. It is not proof the physical path is accessible.",
    "stopped": "Assistance session stopped.",
    "started": "Assistance session started. I will describe possible hazards conservatively.",
    "paused": "Assistance paused.",
    "resumed": "Assistance resumed.",
}


class CommunicationService:
    def build(
        self,
        hazard: HazardEvent | None,
        route: RouteResult | None,
        preferences: UserPreferences,
        *,
        last_key: str | None,
        extra_key: str | None = None,
    ) -> tuple[CommunicationMessage | None, str]:
        key = extra_key
        if key is None and hazard:
            key = hazard.classification
            if hazard.classification in {"possible_obstacle", "possible_blocked_route"} and route and route.status == "error":
                key = "route_fail"
            elif hazard.classification == "possible_blocked_route" and route and route.alternative_available:
                key = "alt_route"
            elif hazard.classification == "possible_blocked_route":
                key = "obstacle_route"
            elif hazard.classification == "possible_obstacle":
                key = "obstacle"
            elif hazard.classification == "moving_object_near_path":
                key = "moving"
            elif hazard.classification == "uncertain":
                key = "uncertain"
            elif hazard.classification == "none":
                key = "clear" if preferences.verbosity != "minimal" else "silent"

        if key in {None, "silent"}:
            return None, last_key or ""

        if key == last_key:
            return None, key

        text = TEMPLATES.get(key, TEMPLATES["uncertain"])
        category = {
            "clear": "informational",
            "obstacle": "caution",
            "obstacle_route": "caution",
            "moving": "caution",
            "uncertain": "uncertainty",
            "alt_route": "route_update",
            "route_fail": "system",
            "camera": "urgent",
            "route_ok": "route_update",
            "started": "system",
            "paused": "system",
            "resumed": "system",
            "stopped": "system",
        }.get(key, "informational")
        speak = category in {"caution", "urgent", "uncertainty", "route_update"} or preferences.verbosity == "detailed"
        if preferences.verbosity == "minimal" and category == "informational":
            speak = False
        return (
            CommunicationMessage(text=text, category=category, speak=speak, suppress_duplicate=True),
            key,
        )
