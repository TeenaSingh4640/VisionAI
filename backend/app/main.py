from __future__ import annotations

import logging
import time
import threading
from starlette.concurrency import run_in_threadpool
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.agents.orchestrator import run_observation_cycle, DEFAULT_DEST, DEFAULT_ORIGIN
from app.communication.service import CommunicationService, TEMPLATES
from app.communication.audio_events import hazard_audio, object_events
from app.core.config import get_settings
from app.events.broker import broker
from app.navigation.service import get_navigation_service
from app.navigation.guidance import guidance_event
from app.perception.demo import decode_image, demo_observation
from app.perception.engine import get_perception_engine
from app.schemas.api import (
    CommandRequest,
    DemoSceneRequest,
    GenericOk,
    LocationRequest,
    ObservationRequest,
    ObservationResponse,
    RouteRequest,
    SessionStartRequest,
    SessionStartResponse,
    SessionStopRequest,
)
from app.schemas.models import SessionEvent, utc_now
from app.storage.sessions import store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("visionmate")
_observation_times: dict[str, float] = {}
_observation_times_lock = threading.Lock()
_observation_inflight: dict[str, threading.Lock] = {}

SAFETY = (
    "VisionMate is a hackathon prototype, not a certified mobility aid. "
    "Never rely on it for unsupervised real-world navigation."
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    logger.info("Starting VisionMate perception_mode=%s routing=%s", settings.perception_mode, settings.routing_provider)
    get_perception_engine()
    yield


app = FastAPI(
    title="VisionMate API",
    version="0.1.0",
    description="Agentic visual assistance prototype for WCC Launchpad 30.",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def emit(session_id: str, kind: str, payload: dict) -> None:
    await broker.publish(session_id, {"type": kind, "payload": payload, "timestamp": utc_now()})


def run_scene_cycle(session, scene: str, simulate_route_failure: bool = False):
    """Blocked scenes run two observations so persistence can trigger a route check."""
    target = "blocked" if scene == "route_failure" else scene
    if target == "blocked":
        first = run_observation_cycle(session, demo_observation("blocked", session_id=session.session_id), simulate_route_failure)
        second = run_observation_cycle(session, demo_observation("blocked", session_id=session.session_id), simulate_route_failure)
        second["activity"] = (first.get("activity") or []) + (second.get("activity") or [])
        return second
    return run_observation_cycle(session, demo_observation(target, session_id=session.session_id), simulate_route_failure)


@app.get("/api/health")
async def health():
    engine = get_perception_engine()
    return {
        "ok": True,
        "app": settings.app_name,
        "perception": engine.mode,
        "perception_model": engine.model_name,
        "inference_max_side": settings.inference_max_side,
        "detection_confidence_threshold": settings.yolo_confidence,
        "routing": get_navigation_service().provider.name,
        "safety": SAFETY,
    }


@app.post("/api/session/start", response_model=SessionStartResponse)
async def start_session(body: SessionStartRequest):
    state = store.create(body.demo_mode, body.destination or "Demo destination", body.preferences)
    store.append_event(
        state.session_id,
        SessionEvent(timestamp=utc_now(), type="session_started", summary="Assistance session started", details={"demo": body.demo_mode}),
    )
    origin = DEFAULT_ORIGIN
    dest = DEFAULT_DEST
    state.route = get_navigation_service().get_route(origin, dest)
    await emit(state.session_id, "session", state.to_public_dict())
    return SessionStartResponse(
        session_id=state.session_id,
        status=state.session_status,
        demo_mode=state.demo_mode,
        perception_mode=get_perception_engine().mode,
        routing_provider=get_navigation_service().provider.name,
        safety_notice=SAFETY,
    )


@app.post("/api/session/stop", response_model=GenericOk)
async def stop_session(body: SessionStopRequest):
    state = store.stop(body.session_id)
    if not state:
        raise HTTPException(404, "Unknown session")
    store.append_event(body.session_id, SessionEvent(timestamp=utc_now(), type="session_stopped", summary="Session stopped"))
    await emit(body.session_id, "session", state.to_public_dict())
    return GenericOk(detail="stopped")


@app.post("/api/observation", response_model=ObservationResponse)
async def submit_observation(body: ObservationRequest):
    try:
        session = store.require(body.session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    if session.session_status in {"stopped", "paused"}:
        raise HTTPException(409, f"Session is {session.session_status}")
    if body.demo_scene:
        if body.demo_scene not in {"clear", "blocked", "uncertain", "pedestrian", "obstacle_removed", "route_failure"}:
            raise HTTPException(422, "Unknown demo scene")
        session.session_status = "processing"
        try:
            result = await run_in_threadpool(run_scene_cycle, session, body.demo_scene, session.simulate_route_failure)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    elif body.image_base64:
        with _observation_times_lock:
            session_lock = _observation_inflight.setdefault(session.session_id, threading.Lock())
        if not session_lock.acquire(blocking=False):
            raise HTTPException(429, "A camera frame is still being processed; stale frames are not queued")
        now = time.monotonic()
        try:
            with _observation_times_lock:
                previous = _observation_times.get(session.session_id)
                min_interval = get_settings().obs_min_interval_ms / 1000
                if previous is not None and now - previous < min_interval:
                    raise HTTPException(429, "Observation rate limit exceeded; wait before sending another frame")
            try:
                frame = decode_image(body.image_base64)
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            with _observation_times_lock:
                _observation_times[session.session_id] = time.monotonic()
            session.session_status = "processing"
            observation = await run_in_threadpool(get_perception_engine().analyze_frame, frame, f"frame_{utc_now()}", session.session_id)
            if body.force_quality:
                observation.quality = body.force_quality  # type: ignore[assignment]
            result = await run_in_threadpool(run_observation_cycle, session, observation, session.simulate_route_failure)
        finally:
            session_lock.release()
    else:
        raise HTTPException(400, "Provide image_base64 or demo_scene")
    public = session.to_public_dict()
    for audio in object_events(session, result["observation"]):
        await emit(session.session_id, "audio_event", audio.model_dump())
    audio = hazard_audio(result.get("hazard"), session.last_alert.text if session.last_alert and session.last_alert.speak else None,
                         result["observation"].source in {"demo", "mock"})
    if audio:
        await emit(session.session_id, "audio_event", audio.model_dump())
    await emit(session.session_id, "session", public)
    return ObservationResponse(
        observation=result["observation"],
        hazard=result["hazard"],
        message=session.last_alert,
        activity=result.get("activity") or [],
        route=result.get("route"),
        session_status=session.session_status,
    )


@app.post("/api/demo/scene", response_model=ObservationResponse)
async def demo_scene(body: DemoSceneRequest):
    try:
        session = store.require(body.session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    session.demo_mode = True
    session.simulate_route_failure = body.simulate_route_failure or body.scene == "route_failure"
    scene = body.scene
    if scene == "reset":
        session.active_hazards = []
        session.last_alert = None
        session.last_alert_key = None
        session.alternative_route = None
        session.simulate_route_failure = False
        session.session_status = "active"
        scene = "clear"
    try:
        result = await run_in_threadpool(run_scene_cycle, session, scene, session.simulate_route_failure)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    for audio in object_events(session, result["observation"]):
        await emit(session.session_id, "audio_event", audio.model_dump())
    audio = hazard_audio(result.get("hazard"), session.last_alert.text if session.last_alert and session.last_alert.speak else None, True)
    if audio:
        await emit(session.session_id, "audio_event", audio.model_dump())
    await emit(session.session_id, "session", session.to_public_dict())
    return ObservationResponse(
        observation=result["observation"],
        hazard=result["hazard"],
        message=session.last_alert,
        activity=result.get("activity") or [],
        route=result.get("route"),
        session_status=session.session_status,
    )


@app.post("/api/command", response_model=GenericOk)
async def command(body: CommandRequest):
    try:
        session = store.require(body.session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    text = body.command.strip().lower()
    store.append_event(
        session.session_id,
        SessionEvent(timestamp=utc_now(), type="user_command", summary=body.command),
    )
    if any(k in text for k in ("stop", "end session")):
        session.session_status = "stopped"
    elif "pause" in text:
        session.session_status = "paused"
        session.last_alert = CommunicationService().build(None, None, session.user_preferences, last_key=None, extra_key="paused")[0]
    elif "resume" in text or "start" in text:
        session.session_status = "active"
        session.last_alert = CommunicationService().build(None, None, session.user_preferences, last_key=None, extra_key="resumed")[0]
    elif "repeat" in text:
        pass
    elif "describe" in text:
        session.last_alert_key = None
        if session.latest_observation:
            run_observation_cycle(session, session.latest_observation, session.simulate_route_failure)
        else:
            session.last_alert = CommunicationService().build(None, None, session.user_preferences, last_key=None, extra_key="uncertain")[0]
    else:
        session.last_alert = CommunicationService().build(None, None, session.user_preferences, last_key=None, extra_key="uncertain")[0]
        if session.last_alert:
            session.last_alert.text = (
                "I understood a voice command, but only start, pause, resume, describe, repeat, and stop are supported."
            )
    await emit(session.session_id, "session", session.to_public_dict())
    return GenericOk(detail=session.session_status)


@app.post("/api/location", response_model=GenericOk)
async def location(body: LocationRequest):
    try:
        session = store.require(body.session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    session.current_location = body.location
    audio = guidance_event(session.route, body.location, session.nav_announced_thresholds)
    if audio:
        await emit(session.session_id, "audio_event", audio.model_dump())
    return GenericOk()


@app.post("/api/navigation/route")
async def navigation_route(body: RouteRequest):
    try:
        session = store.require(body.session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    origin = (
        body.origin_lat if body.origin_lat is not None else DEFAULT_ORIGIN[0],
        body.origin_lon if body.origin_lon is not None else DEFAULT_ORIGIN[1],
    )
    dest = (
        body.dest_lat if body.dest_lat is not None else DEFAULT_DEST[0],
        body.dest_lon if body.dest_lon is not None else DEFAULT_DEST[1],
    )
    if body.destination:
        session.destination = body.destination
    result = await run_in_threadpool(get_navigation_service().get_route, origin, dest, simulate_failure=body.simulate_failure)
    session.route = result
    await emit(session.session_id, "session", session.to_public_dict())
    return result


@app.post("/api/navigation/alternative")
async def navigation_alt(body: RouteRequest):
    try:
        session = store.require(body.session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    origin = (
        body.origin_lat if body.origin_lat is not None else DEFAULT_ORIGIN[0],
        body.origin_lon if body.origin_lon is not None else DEFAULT_ORIGIN[1],
    )
    dest = (
        body.dest_lat if body.dest_lat is not None else DEFAULT_DEST[0],
        body.dest_lon if body.dest_lon is not None else DEFAULT_DEST[1],
    )
    result = await run_in_threadpool(get_navigation_service().get_alternative, origin, dest, simulate_failure=body.simulate_failure)
    session.alternative_route = result
    await emit(session.session_id, "session", session.to_public_dict())
    return result


@app.get("/api/session/{session_id}/state")
async def session_state(session_id: str):
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    return session.to_public_dict()


@app.get("/api/session/{session_id}/events")
async def session_events(session_id: str):
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    return {"events": [e.model_dump() for e in session.event_history[-50:]], "activity": [a.model_dump() for a in session.activity[-50:]]}


@app.patch("/api/session/{session_id}/preferences")
async def update_prefs(session_id: str, body: dict):
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Unknown session")
    current = session.user_preferences.model_dump()
    current.update({k: v for k, v in body.items() if k in current})
    from app.schemas.models import UserPreferences

    session.user_preferences = UserPreferences(**current)
    session.demo_mode = session.user_preferences.demo_mode
    return session.user_preferences


@app.websocket("/ws/session/{session_id}")
async def ws_session(websocket: WebSocket, session_id: str):
    await broker.connect(session_id, websocket)
    try:
        state = store.get(session_id)
        if state:
            await websocket.send_json({"type": "session", "payload": state.to_public_dict(), "timestamp": utc_now()})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await broker.disconnect(session_id, websocket)
    except Exception:
        await broker.disconnect(session_id, websocket)
