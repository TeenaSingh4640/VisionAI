from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


SessionStatus = Literal[
    "idle",
    "starting",
    "active",
    "paused",
    "processing",
    "attention_required",
    "degraded",
    "stopped",
    "error",
]

HazardClass = Literal[
    "none",
    "possible_obstacle",
    "moving_object_near_path",
    "possible_blocked_route",
    "uncertain",
]

MessageCategory = Literal[
    "informational",
    "caution",
    "urgent",
    "route_update",
    "system",
    "uncertainty",
]

EventType = Literal[
    "obstacle_detected",
    "obstacle_persisting",
    "obstacle_cleared",
    "route_conflict",
    "route_updated",
    "route_check_failed",
    "user_command",
    "scene_changed",
    "camera_unavailable",
    "network_error",
    "session_started",
    "session_stopped",
    "observation_requested",
    "instruction_generated",
    "status",
]


class BoundingBox(BaseModel):
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    x2: float = Field(ge=0, le=1)
    y2: float = Field(ge=0, le=1)


class DetectedObject(BaseModel):
    class_name: str
    confidence: float = Field(ge=0, le=1)
    bbox: BoundingBox
    track_id: int | None = None


class Observation(BaseModel):
    timestamp: str
    frame_id: str
    objects: list[DetectedObject] = Field(default_factory=list)
    processing_ms: float = 0
    source: Literal["yolo", "mock", "demo", "uploaded"] = "mock"
    quality: Literal["ok", "low", "blurry", "dark", "conflicting"] = "ok"
    notes: str | None = None


class HazardEvent(BaseModel):
    classification: HazardClass
    priority: Literal["low", "medium", "high"] = "low"
    confidence: float = Field(ge=0, le=1, default=0.5)
    uncertainty: float = Field(ge=0, le=1, default=0.5)
    reasoning: str
    recommended_action: Literal[
        "monitor",
        "request_observation",
        "query_route",
        "alert_user",
        "pause",
    ] = "monitor"
    affecting_route: bool = False
    object_ids: list[int] = Field(default_factory=list)


class RouteInstruction(BaseModel):
    instruction: str
    distance_m: float
    maneuver_type: str | None = None
    maneuver_modifier: str | None = None
    maneuver_location: list[float] | None = None


class RouteResult(BaseModel):
    route_id: str
    provider: str
    status: Literal["available", "unavailable", "error", "requires_review"]
    distance_m: float | None = None
    duration_s: float | None = None
    instructions: list[RouteInstruction] = Field(default_factory=list)
    geometry: list[list[float]] = Field(default_factory=list)
    is_simulated: bool = True
    error: str | None = None
    alternative_available: bool = False


class CommunicationMessage(BaseModel):
    text: str
    category: MessageCategory
    speak: bool = True
    suppress_duplicate: bool = True
    source: Literal["template", "system"] = "template"


class AgentActivity(BaseModel):
    timestamp: str
    step: str
    agent: str
    reason: str
    tool: str | None = None
    result: str | None = None
    next_action: str | None = None
    confidence: float | None = None
    waiting_for_observation: bool = False
    simulated: bool = False


class SessionEvent(BaseModel):
    timestamp: str
    type: EventType
    summary: str
    details: dict[str, Any] = Field(default_factory=dict)
    simulated: bool = False


class UserPreferences(BaseModel):
    voice_rate: float = 1.0
    verbosity: Literal["minimal", "balanced", "detailed"] = "balanced"
    scene_descriptions: bool = False
    demo_mode: bool = True
    reduced_visuals: bool = False


class LocationFix(BaseModel):
    lat: float
    lon: float
    heading: float | None = None
    accuracy_m: float | None = None
    timestamp: str | None = None
    simulated: bool = False


class AudioEvent(BaseModel):
    event_id: str
    source: Literal["object_detection", "navigation", "system"]
    category: Literal["object_announcement", "hazard_alert", "turn_instruction", "route_update", "system_alert"]
    priority: int = Field(ge=1, le=4)
    text: str = Field(min_length=1, max_length=240)
    created_at: str
    expires_after_ms: int = Field(ge=500, le=60_000)
    deduplication_key: str = Field(min_length=1, max_length=160)
    simulated: bool = False


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
