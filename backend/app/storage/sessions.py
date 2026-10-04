from __future__ import annotations

import threading
from dataclasses import dataclass, field
from uuid import uuid4

from app.schemas.models import (
    AgentActivity,
    CommunicationMessage,
    HazardEvent,
    LocationFix,
    Observation,
    RouteResult,
    SessionEvent,
    UserPreferences,
    utc_now,
)


@dataclass
class SessionState:
    session_id: str
    user_goal: str = "Navigate with awareness"
    destination: str = "Demo destination"
    route: RouteResult | None = None
    alternative_route: RouteResult | None = None
    current_location: LocationFix | None = None
    latest_observation: Observation | None = None
    active_hazards: list[HazardEvent] = field(default_factory=list)
    event_history: list[SessionEvent] = field(default_factory=list)
    activity: list[AgentActivity] = field(default_factory=list)
    last_alert: CommunicationMessage | None = None
    last_alert_key: str | None = None
    current_agent_step: str = "idle"
    pending_tool: str | None = None
    retry_count: int = 0
    user_preferences: UserPreferences = field(default_factory=UserPreferences)
    connectivity_status: str = "ok"
    session_status: str = "idle"
    demo_mode: bool = True
    simulate_route_failure: bool = False
    last_observation_at: str | None = None
    created_at: str = field(default_factory=utc_now)
    announced_audio_keys: set[str] = field(default_factory=set)
    object_track_streaks: dict[str, int] = field(default_factory=dict)
    nav_announced_thresholds: set[str] = field(default_factory=set)

    def to_public_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "user_goal": self.user_goal,
            "destination": self.destination,
            "route": self.route.model_dump() if self.route else None,
            "alternative_route": self.alternative_route.model_dump() if self.alternative_route else None,
            "current_location": self.current_location.model_dump() if self.current_location else None,
            "latest_observation": self.latest_observation.model_dump() if self.latest_observation else None,
            "active_hazards": [h.model_dump() for h in self.active_hazards],
            "event_history": [e.model_dump() for e in self.event_history[-40:]],
            "activity": [a.model_dump() for a in self.activity[-40:]],
            "last_alert": self.last_alert.model_dump() if self.last_alert else None,
            "current_agent_step": self.current_agent_step,
            "pending_tool": self.pending_tool,
            "retry_count": self.retry_count,
            "user_preferences": self.user_preferences.model_dump(),
            "connectivity_status": self.connectivity_status,
            "session_status": self.session_status,
            "demo_mode": self.demo_mode,
            "last_observation_at": self.last_observation_at,
            "created_at": self.created_at,
        }


class SessionStore:
    """In-memory session isolation. Production would persist and lock per session."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        self._lock = threading.RLock()

    def create(self, demo_mode: bool, destination: str, preferences: UserPreferences | None) -> SessionState:
        session_id = str(uuid4())
        state = SessionState(
            session_id=session_id,
            destination=destination or "Demo destination",
            demo_mode=demo_mode,
            user_preferences=preferences or UserPreferences(demo_mode=demo_mode),
            session_status="active",
        )
        with self._lock:
            self._sessions[session_id] = state
        return state

    def get(self, session_id: str) -> SessionState | None:
        with self._lock:
            return self._sessions.get(session_id)

    def require(self, session_id: str) -> SessionState:
        state = self.get(session_id)
        if state is None:
            raise KeyError(session_id)
        return state

    def stop(self, session_id: str) -> SessionState | None:
        with self._lock:
            state = self._sessions.get(session_id)
            if state:
                state.session_status = "stopped"
            return state

    def append_event(self, session_id: str, event: SessionEvent) -> None:
        with self._lock:
            state = self._sessions.get(session_id)
            if not state:
                return
            state.event_history.append(event)
            if len(state.event_history) > 200:
                state.event_history = state.event_history[-200:]

    def append_activity(self, session_id: str, activity: AgentActivity) -> None:
        with self._lock:
            state = self._sessions.get(session_id)
            if not state:
                return
            state.activity.append(activity)
            state.current_agent_step = activity.step
            if len(state.activity) > 200:
                state.activity = state.activity[-200:]


store = SessionStore()
