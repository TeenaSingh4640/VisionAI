from __future__ import annotations

from typing import Any, Literal, TypedDict

from langgraph.graph import END, StateGraph

from app.communication.service import CommunicationService
from app.hazard.engine import get_hazard_engine
from app.navigation.service import get_navigation_service
from app.schemas.models import AgentActivity, HazardEvent, Observation, RouteResult, SessionEvent, utc_now
from app.storage.sessions import SessionState, store

DEFAULT_ORIGIN = (12.9716, 77.5946)
DEFAULT_DEST = (12.9750, 77.6050)


class OrchestratorState(TypedDict, total=False):
    session_id: str
    observation: Observation
    hazard: HazardEvent
    route: RouteResult | None
    activity: list[AgentActivity]
    next_node: str
    simulate_route_failure: bool


def _act(
    step: str,
    agent: str,
    reason: str,
    *,
    tool: str | None = None,
    result: str | None = None,
    next_action: str | None = None,
    confidence: float | None = None,
    waiting: bool = False,
    simulated: bool = False,
) -> AgentActivity:
    return AgentActivity(
        timestamp=utc_now(),
        step=step,
        agent=agent,
        reason=reason,
        tool=tool,
        result=result,
        next_action=next_action,
        confidence=confidence,
        waiting_for_observation=waiting,
        simulated=simulated,
    )


def inspect_state(state: OrchestratorState) -> OrchestratorState:
    session = store.require(state["session_id"])
    activity = list(state.get("activity") or [])
    activity.append(
        _act(
            "inspect_state",
            "orchestrator",
            f"Session {session.session_status}; destination '{session.destination}'.",
            next_action="assess_hazard",
        )
    )
    return {**state, "activity": activity, "next_node": "assess_hazard"}


def assess_hazard(state: OrchestratorState) -> OrchestratorState:
    session = store.require(state["session_id"])
    observation = state["observation"]
    hazard = get_hazard_engine().assess(session.session_id, observation, route_active=True)
    activity = list(state.get("activity") or [])
    activity.append(
        _act(
            "hazard_assessment",
            "hazard_engine",
            hazard.reasoning,
            tool="hazard.assess",
            result=hazard.classification,
            next_action=hazard.recommended_action,
            confidence=hazard.confidence,
        )
    )
    session.active_hazards = [] if hazard.classification == "none" else [hazard]
    session.latest_observation = observation
    session.last_observation_at = observation.timestamp
    return {**state, "hazard": hazard, "activity": activity}


def route_decision(state: OrchestratorState) -> Literal["query_route", "communicate"]:
    hazard = state["hazard"]
    if hazard.recommended_action == "query_route" or hazard.classification == "possible_blocked_route":
        return "query_route"
    return "communicate"


def query_route(state: OrchestratorState) -> OrchestratorState:
    session = store.require(state["session_id"])
    activity = list(state.get("activity") or [])
    origin = DEFAULT_ORIGIN
    dest = DEFAULT_DEST
    if session.current_location:
        origin = (session.current_location.lat, session.current_location.lon)
    fail = bool(state.get("simulate_route_failure") or session.simulate_route_failure)
    activity.append(
        _act(
            "navigation",
            "navigation_tool",
            "Possible route conflict: requesting alternative mapped route for review.",
            tool="navigation.get_alternative",
            next_action="validate_route",
            simulated=True,
        )
    )
    session.pending_tool = "navigation.get_alternative"
    result = get_navigation_service().get_alternative(origin, dest, simulate_failure=fail)
    session.pending_tool = None
    if result.status == "error":
        session.connectivity_status = "routing_error"
        session.retry_count += 1
        activity.append(
            _act(
                "validate_route",
                "orchestrator",
                "Routing tool failed. No alternate route will be invented.",
                tool="navigation.get_alternative",
                result=result.error or "error",
                next_action="communicate_failure",
                simulated=result.is_simulated,
            )
        )
        store.append_event(
            session.session_id,
            SessionEvent(
                timestamp=utc_now(),
                type="route_check_failed",
                summary="Routing provider failed",
                details={"error": result.error},
                simulated=result.is_simulated,
            ),
        )
    else:
        session.alternative_route = result
        session.connectivity_status = "ok"
        activity.append(
            _act(
                "validate_route",
                "orchestrator",
                "Alternative mapped route returned. User must review; not selected automatically.",
                tool="navigation.get_alternative",
                result=f"{result.status}; {result.distance_m} m",
                next_action="communicate",
                simulated=result.is_simulated,
            )
        )
        store.append_event(
            session.session_id,
            SessionEvent(
                timestamp=utc_now(),
                type="route_updated",
                summary="Alternative route available for review",
                details={"route_id": result.route_id, "simulated": result.is_simulated},
                simulated=result.is_simulated,
            ),
        )
    return {**state, "route": result, "activity": activity}


def communicate(state: OrchestratorState) -> OrchestratorState:
    session = store.require(state["session_id"])
    hazard = state["hazard"]
    route = state.get("route")
    message, key = CommunicationService().build(
        hazard,
        route,
        session.user_preferences,
        last_key=session.last_alert_key,
    )
    activity = list(state.get("activity") or [])
    waiting = hazard.recommended_action in {"request_observation", "monitor"}
    if message is None:
        activity.append(
            _act(
                "communication",
                "communication",
                "Duplicate or low-priority message suppressed.",
                result="suppressed",
                next_action="monitor",
                waiting=waiting,
            )
        )
    else:
        session.last_alert = message
        session.last_alert_key = key
        activity.append(
            _act(
                "communication",
                "communication",
                "Template alert selected for safety-critical wording.",
                tool="communication.template",
                result=message.text,
                next_action="monitor",
                waiting=waiting,
            )
        )
        store.append_event(
            session.session_id,
            SessionEvent(
                timestamp=utc_now(),
                type="instruction_generated",
                summary=message.text,
                details={"category": message.category, "key": key},
            ),
        )
    if hazard.classification == "none":
        session.session_status = "active"
        session.last_alert_key = key
        if session.active_hazards:
            store.append_event(
                session.session_id,
                SessionEvent(timestamp=utc_now(), type="obstacle_cleared", summary="No relevant obstruction in current view"),
            )
    elif hazard.classification == "uncertain":
        session.session_status = "attention_required"
    else:
        session.session_status = "attention_required"
        event_type = "obstacle_persisting" if hazard.object_ids else "obstacle_detected"
        store.append_event(
            session.session_id,
            SessionEvent(
                timestamp=utc_now(),
                type=event_type,
                summary=hazard.reasoning,
                details={"classification": hazard.classification},
            ),
        )
    activity.append(
        _act(
            "monitoring",
            "monitor",
            "Waiting for a meaningful scene update before reassessing.",
            next_action="wait",
            waiting=True,
        )
    )
    session.current_agent_step = "monitoring"
    return {**state, "activity": activity}


def build_graph():
    graph = StateGraph(OrchestratorState)
    graph.add_node("inspect_state", inspect_state)
    graph.add_node("assess_hazard", assess_hazard)
    graph.add_node("query_route", query_route)
    graph.add_node("communicate", communicate)
    graph.set_entry_point("inspect_state")
    graph.add_edge("inspect_state", "assess_hazard")
    graph.add_conditional_edges("assess_hazard", route_decision, {"query_route": "query_route", "communicate": "communicate"})
    graph.add_edge("query_route", "communicate")
    graph.add_edge("communicate", END)
    return graph.compile()


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def run_observation_cycle(session: SessionState, observation: Observation, simulate_route_failure: bool = False) -> dict[str, Any]:
    result = get_graph().invoke(
        {
            "session_id": session.session_id,
            "observation": observation,
            "activity": [
                _act(
                    "perception",
                    "perception",
                    f"{len(observation.objects)} object(s) from {observation.source}.",
                    tool="perception.analyze",
                    result=f"quality={observation.quality}",
                    next_action="inspect_state",
                    confidence=max([o.confidence for o in observation.objects], default=None),
                    simulated=observation.source in {"mock", "demo"},
                )
            ],
            "simulate_route_failure": simulate_route_failure,
        }
    )
    for item in result.get("activity") or []:
        store.append_activity(session.session_id, item)
    return result
