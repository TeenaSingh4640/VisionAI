from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from uuid import uuid4

import httpx

from app.core.config import get_settings
from app.navigation.guidance import distance_m
from app.schemas.models import RouteInstruction, RouteResult

logger = logging.getLogger("visionmate.navigation")


class RoutingProvider(ABC):
    name = "base"

    @abstractmethod
    def get_route(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        *,
        alternative: bool = False,
        simulate_failure: bool = False,
    ) -> RouteResult:
        raise NotImplementedError


class MockRoutingProvider(RoutingProvider):
    name = "mock"

    def get_route(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        *,
        alternative: bool = False,
        simulate_failure: bool = False,
    ) -> RouteResult:
        if simulate_failure:
            return RouteResult(
                route_id=str(uuid4()),
                provider="mock",
                status="error",
                is_simulated=True,
                error="Simulated routing provider failure",
            )
        if alternative:
            geometry = [
                [origin[1], origin[0]],
                [origin[1] + 0.0015, origin[0] + 0.0004],
                [destination[1], destination[0]],
            ]
            return RouteResult(
                route_id="alt_mock_01",
                provider="mock",
                status="requires_review",
                distance_m=920,
                duration_s=780,
                instructions=[
                    RouteInstruction(
                        instruction="Mapped alternative available for review. Do not treat as a verified accessible path.",
                        distance_m=920,
                    )
                ],
                geometry=geometry,
                is_simulated=True,
                alternative_available=True,
            )
        geometry = [
            [origin[1], origin[0]],
            [origin[1], origin[0] + 0.0045],
            [destination[1], destination[0]],
        ]
        distance_to_turn = distance_m(origin[0], origin[1], origin[0] + 0.0045, origin[1])
        distance_after_turn = distance_m(origin[0] + 0.0045, origin[1], destination[0], destination[1])
        mapped_distance = distance_to_turn + distance_after_turn
        return RouteResult(
            route_id=str(uuid4()),
            provider="mock",
            status="available",
            distance_m=mapped_distance,
            duration_s=mapped_distance / 1.2,
            instructions=[
                RouteInstruction(
                    instruction="Turn right on the mapped route",
                    distance_m=distance_after_turn,
                    maneuver_type="turn",
                    maneuver_modifier="right",
                    maneuver_location=[origin[1], origin[0] + 0.0045],
                ),
                RouteInstruction(
                    instruction="Mapped destination remains ahead. Review surroundings independently.",
                    distance_m=350,
                    maneuver_type="arrive",
                    maneuver_modifier="straight",
                    maneuver_location=[destination[1], destination[0]],
                ),
            ],
            geometry=geometry,
            is_simulated=True,
            alternative_available=True,
        )


class OSRMRoutingProvider(RoutingProvider):
    name = "osrm"

    def get_route(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        *,
        alternative: bool = False,
        simulate_failure: bool = False,
    ) -> RouteResult:
        if simulate_failure:
            return RouteResult(
                route_id=str(uuid4()),
                provider="osrm",
                status="error",
                is_simulated=False,
                error="Simulated routing provider failure",
            )
        settings = get_settings()
        coords = f"{origin[1]},{origin[0]};{destination[1]},{destination[0]}"
        profile = settings.osrm_profile.strip().lower()
        url = f"{settings.osrm_base_url.rstrip('/')}/route/v1/{profile}/{coords}"
        params = {"overview": "full", "geometries": "geojson", "steps": "true", "alternatives": "true" if alternative else "false"}
        try:
            with httpx.Client(timeout=settings.routing_timeout_s) as client:
                response = client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            logger.warning("OSRM request failed: %s", exc)
            return RouteResult(
                route_id=str(uuid4()),
                provider="osrm",
                status="error",
                is_simulated=False,
                error=str(exc),
            )
        routes = data.get("routes") or []
        if not routes:
            return RouteResult(
                route_id=str(uuid4()),
                provider="osrm",
                status="unavailable",
                is_simulated=False,
                error="No route returned",
            )
        chosen = routes[-1] if alternative and len(routes) > 1 else routes[0]
        geometry = chosen.get("geometry", {}).get("coordinates") or []
        steps = []
        for leg in chosen.get("legs") or []:
            for step in leg.get("steps") or []:
                man = step.get("maneuver", {})
                instruction = man.get("instruction") or man.get("type") or "Continue along mapped route"
                location = man.get("location")
                steps.append(RouteInstruction(
                    instruction=str(instruction), distance_m=float(step.get("distance") or 0),
                    maneuver_type=str(man.get("type")) if man.get("type") else None,
                    maneuver_modifier=str(man.get("modifier")) if man.get("modifier") else None,
                    maneuver_location=[float(location[0]), float(location[1])] if isinstance(location, list) and len(location) >= 2 else None,
                ))
        if not steps:
            steps = [RouteInstruction(instruction="Continue along the current mapped route", distance_m=float(chosen.get("distance") or 0))]
        return RouteResult(
            route_id=str(uuid4()),
            provider="osrm",
            status="requires_review" if alternative else "available",
            distance_m=float(chosen.get("distance") or 0),
            duration_s=float(chosen.get("duration") or 0),
            instructions=steps[:8],
            geometry=[[float(lon), float(lat)] for lon, lat in geometry],
            is_simulated=False,
            alternative_available=len(routes) > 1,
        )


class NavigationService:
    def __init__(self) -> None:
        settings = get_settings()
        self.provider: RoutingProvider = (
            OSRMRoutingProvider() if settings.routing_provider == "osrm" else MockRoutingProvider()
        )

    def get_route(self, origin: tuple[float, float], destination: tuple[float, float], **kwargs) -> RouteResult:
        return self.provider.get_route(origin, destination, **kwargs)

    def get_alternative(self, origin: tuple[float, float], destination: tuple[float, float], **kwargs) -> RouteResult:
        return self.provider.get_route(origin, destination, alternative=True, **kwargs)


_nav: NavigationService | None = None


def get_navigation_service() -> NavigationService:
    global _nav
    if _nav is None:
        _nav = NavigationService()
    return _nav


def reset_navigation_service(service: NavigationService | None = None) -> None:
    global _nav
    _nav = service
