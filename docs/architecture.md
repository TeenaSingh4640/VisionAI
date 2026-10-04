# VisionMate architecture

## Design principles

1. Perception, hazard rules, routing, and speech are separate modules.
2. The orchestrator selects tools; it does not invent sensor data.
3. Safety-critical phrases are templates, not free-form LLM text.
4. Simulated outputs are labeled. Failures are not replaced with fake success.
5. Sessions are isolated in process memory.

## Modules

### Input manager

`POST /api/observation` and the demo scene endpoint accept either a JPEG (base64) or a named demo scene. Frames are size-limited and resized before inference. Camera sampling rate is enforced in the browser (~1.6s).

### Perception

`app/perception/engine.py` defines a `PerceptionAdapter`. Implementations:

- `YOLOPerception` — Ultralytics predict + IOU tracker
- `MockPerception` — quality heuristics only
- Demo injector — structured objects for judging

Output is always the shared `Observation` schema with normalized boxes.

### Hazard assessment

`app/hazard/engine.py` is deterministic:

- Dark/low-quality frames → `uncertain`
- Path-region obstruction classes with area and persistence → possible obstacle / possible blocked route
- Person in path region → moving object near path (no collision claim)
- Persistence uses track IDs across observations per session

### Navigation

`app/navigation/service.py` abstracts `mock` and `osrm`. Both return `RouteResult`. Alternatives are `requires_review`. Errors have empty geometry.

### Communication

`app/communication/service.py` maps hazard + route outcome to templates and suppresses duplicates via `last_alert_key`.

### Orchestrator

`app/agents/orchestrator.py` is a LangGraph state machine:

```
inspect_state → assess_hazard → (query_route | communicate) → communicate → END
```

The graph runs **on observation/command events**, not on every camera frame. Activity records are appended to session state and pushed over WebSockets.

### Shared state

`app/storage/sessions.py` holds per-session `SessionState` behind a lock. Production would need Redis/SQL and auth.

## What is real vs simulated

| Capability | Real | Simulated |
| --- | --- | --- |
| YOLO detections | When model loads | Demo scene objects |
| Hazard rules | Always real code | Driven by simulated objects in demo |
| LangGraph tool choice | Always real | — |
| Routing | Optional OSRM | Default mock provider |
| Speech | Browser TTS/STT | — |
