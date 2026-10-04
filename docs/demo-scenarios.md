# Demo scenarios

Use the dashboard **Hackathon demonstration** panel after **Start assistance**.

## Demo 1 — Clear sidewalk

- Action: Load clear scene
- Perception: no obstruction-class objects
- Hazard: `none`
- Orchestrator: does **not** call `navigation.get_alternative`
- Speech (balanced verbosity): path appears clear based on the current view; not a safety guarantee
- Then: monitoring waits for the next observation

## Demo 2 — Blocked sidewalk

- Action: Load blocked scene (internally persists the motorcycle across two observations)
- Perception: motorcycle in the lower-central region
- Hazard: possible blocked route
- Orchestrator: navigation tool for an alternative mapped route
- UI: simulated route labeled; alternative available for review
- Speech: pause / mapped path may be blocked

## Demo 3 — Obstacle disappears

- Action: Simulate obstacle removal
- Hazard returns to `none`
- Obsolete alert key can change; duplicate of the same alert is suppressed
- Activity shows reassessment and monitoring

## Extra judging beats

| Control | Expected |
| --- | --- |
| Uncertain scene | `uncertain`, no route tool, pause-and-check phrase |
| Temporary pedestrian | moving object near path, no collision claim |
| Simulate route API failure | `status=error`, empty geometry, speech about failed lookup |
| Reset demo | clears hazard and last alert, then a clear observation |

Never present simulated detections as live YOLO output. The UI shows `source` and a simulated badge on routing.
