# VisionMate API

Interactive docs: `http://127.0.0.1:8000/docs`

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Process health, perception mode, routing provider |
| POST | `/api/session/start` | Create isolated session |
| POST | `/api/session/stop` | Stop session |
| POST | `/api/observation` | Image or demo_scene → perception + orchestrator |
| POST | `/api/demo/scene` | Hackathon scene loader |
| POST | `/api/command` | Text/voice command |
| POST | `/api/location` | Location fix (not echoed in public logs) |
| POST | `/api/navigation/route` | Mapped route |
| POST | `/api/navigation/alternative` | Alternative for review |
| GET | `/api/session/{id}/state` | Public session snapshot |
| GET | `/api/session/{id}/events` | Events + agent activity |
| PATCH | `/api/session/{id}/preferences` | Voice/verbosity/demo flags |
| WS | `/ws/session/{id}` | Live `session` payloads |

## Observation response (abridged)

```json
{
  "observation": {
    "timestamp": "2026-10-04T07:00:00+00:00",
    "frame_id": "demo_blocked_ab12",
    "objects": [
      {
        "class_name": "motorcycle",
        "confidence": 0.94,
        "bbox": { "x1": 0.42, "y1": 0.48, "x2": 0.78, "y2": 0.91 },
        "track_id": 1
      }
    ],
    "processing_ms": 8,
    "source": "demo"
  },
  "hazard": {
    "classification": "possible_blocked_route",
    "recommended_action": "query_route"
  },
  "message": {
    "text": "The mapped path may be blocked. An alternative route is available for review.",
    "category": "route_update"
  }
}
```

CORS is limited to configured origins. Upload size is capped by `VISIONMATE_FRAME_MAX_BYTES`.
