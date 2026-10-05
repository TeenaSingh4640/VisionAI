from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.models import (
    AgentActivity,
    CommunicationMessage,
    HazardEvent,
    LocationFix,
    Observation,
    PlaceCandidate,
    RouteResult,
    UserPreferences,
)


class SessionStartRequest(BaseModel):
    destination: str | None = "Demo destination"
    demo_mode: bool = True
    preferences: UserPreferences | None = None


class SessionStartResponse(BaseModel):
    session_id: str
    status: str
    demo_mode: bool
    perception_mode: str
    routing_provider: str
    safety_notice: str


class SessionStopRequest(BaseModel):
    session_id: str


class ObservationRequest(BaseModel):
    session_id: str
    image_base64: str | None = None
    demo_scene: str | None = None
    force_quality: Literal["ok", "low", "blurry", "dark", "conflicting"] | None = None


class ObservationResponse(BaseModel):
    observation: Observation
    hazard: HazardEvent
    message: CommunicationMessage | None = None
    activity: list[AgentActivity] = Field(default_factory=list)
    route: RouteResult | None = None
    session_status: str


class CommandRequest(BaseModel):
    session_id: str
    command: str


class LocationRequest(BaseModel):
    session_id: str
    location: LocationFix


class RouteRequest(BaseModel):
    session_id: str
    destination: str | None = None
    origin_lat: float | None = None
    origin_lon: float | None = None
    dest_lat: float | None = None
    dest_lon: float | None = None
    simulate_failure: bool = False


class NavigationPreviewRequest(BaseModel):
    session_id: str
    destination: str = Field(min_length=2, max_length=160)
    dest_lat: float = Field(ge=-90, le=90)
    dest_lon: float = Field(ge=-180, le=180)
    origin_lat: float = Field(ge=-90, le=90)
    origin_lon: float = Field(ge=-180, le=180)
    origin_accuracy_m: float = Field(gt=0, le=1000)
    simulated: bool = False


class NavigationStartRequest(BaseModel):
    session_id: str


class NavigationControlRequest(BaseModel):
    session_id: str
    action: Literal["pause", "resume", "stop"]


class PlacesResponse(BaseModel):
    places: list[PlaceCandidate]
    attribution: str = "© OpenStreetMap contributors"


class DemoSceneRequest(BaseModel):
    session_id: str
    scene: Literal["clear", "blocked", "uncertain", "pedestrian", "obstacle_removed", "route_failure", "reset"]
    simulate_route_failure: bool = False


class GenericOk(BaseModel):
    ok: bool = True
    detail: str | None = None
