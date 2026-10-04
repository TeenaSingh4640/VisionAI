from __future__ import annotations

import base64
import binascii
import logging
from uuid import uuid4

import cv2
import numpy as np

from app.core.config import get_settings
from app.perception.engine import SimpleIOUTracker
from app.schemas.models import BoundingBox, DetectedObject, Observation, utc_now

logger = logging.getLogger("visionmate.demo")

TRACKERS: dict[str, SimpleIOUTracker] = {}


def decode_image(image_base64: str) -> np.ndarray:
    settings = get_settings()
    encoded = image_base64.split(",")[-1]
    # Reject oversized inputs before allocating the decoded byte buffer.
    if len(encoded) > ((settings.frame_max_bytes + 2) // 3) * 4:
        raise ValueError("Image exceeds maximum allowed size")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Image must be valid base64 data") from exc
    if len(raw) > settings.frame_max_bytes:
        raise ValueError("Image exceeds maximum allowed size")
    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Unable to decode image")
    h, w = frame.shape[:2]
    max_side = settings.inference_max_side
    scale = max_side / max(h, w)
    if scale < 1:
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
    return frame


def blank_frame(color: tuple[int, int, int] = (40, 40, 40)) -> np.ndarray:
    return np.full((360, 640, 3), color, dtype=np.uint8)


DEMO_SCENES = {
    "clear": {
        "objects": [],
        "quality": "ok",
        "notes": "Demo 1: clear sidewalk (simulated detections).",
    },
    "blocked": {
        "objects": [
            {
                "class_name": "motorcycle",
                "confidence": 0.94,
                "bbox": {"x1": 0.42, "y1": 0.48, "x2": 0.78, "y2": 0.92},
            }
        ],
        "quality": "ok",
        "notes": "Demo 2: motorcycle in apparent path (simulated detections).",
    },
    "uncertain": {
        "objects": [],
        "quality": "dark",
        "notes": "Demo: low visibility / uncertain scene.",
    },
    "pedestrian": {
        "objects": [
            {
                "class_name": "person",
                "confidence": 0.88,
                "bbox": {"x1": 0.40, "y1": 0.30, "x2": 0.58, "y2": 0.95},
            }
        ],
        "quality": "ok",
        "notes": "Demo: pedestrian crossing the view (simulated).",
    },
    "obstacle_removed": {
        "objects": [],
        "quality": "ok",
        "notes": "Demo 3: obstruction no longer in view (simulated).",
    },
}


def demo_observation(scene: str, persist: bool = True, *, session_id: str = "default") -> Observation:
    spec = DEMO_SCENES.get(scene)
    if spec is None:
        raise ValueError(f"Unknown demo scene: {scene}")
    objects = [DetectedObject(class_name=o["class_name"], confidence=o["confidence"], bbox=BoundingBox(**o["bbox"])) for o in spec["objects"]]
    if persist:
        tracker = TRACKERS.setdefault(session_id, SimpleIOUTracker())
        objects = tracker.update(objects)
    return Observation(
        timestamp=utc_now(),
        frame_id=f"demo_{scene}_{uuid4().hex[:6]}",
        objects=objects,
        processing_ms=8.0,
        source="demo",
        quality=spec["quality"],
        notes=spec["notes"],
    )
