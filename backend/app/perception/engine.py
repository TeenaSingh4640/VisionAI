from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from typing import Protocol

import numpy as np

from app.core.config import get_settings
from app.schemas.models import BoundingBox, DetectedObject, Observation, utc_now

logger = logging.getLogger("visionmate.perception")

SUPPORTED_FOCUS = {
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "bus",
    "truck",
    "traffic light",
    "stop sign",
    "bench",
    "chair",
}


class PerceptionAdapter(Protocol):
    name: str

    def analyze(self, frame: np.ndarray, frame_id: str) -> Observation: ...


class BaseDetector(ABC):
    name = "base"

    @abstractmethod
    def analyze(self, frame: np.ndarray, frame_id: str) -> Observation:
        raise NotImplementedError


class SimpleIOUTracker:
    def __init__(self, iou_threshold: float = 0.35) -> None:
        self.iou_threshold = iou_threshold
        self._next_id = 1
        self._tracks: dict[int, DetectedObject] = {}

    @staticmethod
    def _iou(a: BoundingBox, b: BoundingBox) -> float:
        ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
        ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        area_a = max(0.0, a.x2 - a.x1) * max(0.0, a.y2 - a.y1)
        area_b = max(0.0, b.x2 - b.x1) * max(0.0, b.y2 - b.y1)
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    def update(self, objects: list[DetectedObject]) -> list[DetectedObject]:
        assigned: set[int] = set()
        updated: list[DetectedObject] = []
        for obj in objects:
            best_id = None
            best_iou = 0.0
            for track_id, prev in self._tracks.items():
                if track_id in assigned or prev.class_name != obj.class_name:
                    continue
                score = self._iou(prev.bbox, obj.bbox)
                if score > best_iou:
                    best_iou = score
                    best_id = track_id
            if best_id is not None and best_iou >= self.iou_threshold:
                obj.track_id = best_id
                assigned.add(best_id)
            else:
                obj.track_id = self._next_id
                self._next_id += 1
            updated.append(obj)
        self._tracks = {o.track_id: o for o in updated if o.track_id is not None}
        return updated


class MockPerception(BaseDetector):
    name = "mock"

    def __init__(self) -> None:
        self.tracker = SimpleIOUTracker()

    def analyze(self, frame: np.ndarray, frame_id: str) -> Observation:
        start = time.perf_counter()
        h, w = frame.shape[:2]
        mean = float(np.mean(frame)) if frame.size else 0
        quality = "ok"
        objects: list[DetectedObject] = []
        if mean < 28:
            quality = "dark"
        elif frame.size and float(np.std(frame)) < 8:
            quality = "low"
        ms = (time.perf_counter() - start) * 1000
        return Observation(
            timestamp=utc_now(),
            frame_id=frame_id,
            objects=self.tracker.update(objects),
            processing_ms=round(ms, 2),
            source="mock",
            quality=quality,
            notes="Mock perception: no YOLO detections. Demo scenes inject structured objects.",
        )


class YOLOPerception(BaseDetector):
    name = "yolo"

    def __init__(self, model_name: str) -> None:
        from ultralytics import YOLO

        self.model = YOLO(model_name)
        self.tracker = SimpleIOUTracker()

    def analyze(self, frame: np.ndarray, frame_id: str) -> Observation:
        start = time.perf_counter()
        results = self.model.predict(frame, verbose=False, imgsz=get_settings().inference_max_side)
        objects: list[DetectedObject] = []
        if results:
            result = results[0]
            names = result.names
            h, w = frame.shape[:2]
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    cls_id = int(box.cls[0])
                    label = str(names.get(cls_id, cls_id))
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                    objects.append(
                        DetectedObject(
                            class_name=label,
                            confidence=round(conf, 4),
                            bbox=BoundingBox(
                                x1=max(0, min(1, x1 / w)),
                                y1=max(0, min(1, y1 / h)),
                                x2=max(0, min(1, x2 / w)),
                                y2=max(0, min(1, y2 / h)),
                            ),
                        )
                    )
        objects = self.tracker.update(objects)
        ms = (time.perf_counter() - start) * 1000
        quality = "ok"
        if not objects and float(np.mean(frame)) < 30:
            quality = "dark"
        return Observation(
            timestamp=utc_now(),
            frame_id=frame_id,
            objects=objects,
            processing_ms=round(ms, 2),
            source="yolo",
            quality=quality,
        )


class PerceptionEngine:
    def __init__(self) -> None:
        settings = get_settings()
        self.mode = settings.perception_mode
        self.backend: BaseDetector
        if self.mode == "mock":
            self.backend = MockPerception()
        else:
            try:
                self.backend = YOLOPerception(settings.yolo_model)
                self.mode = "yolo"
                logger.info("Loaded YOLO model %s", settings.yolo_model)
            except Exception as exc:
                logger.warning("YOLO unavailable (%s); using mock perception", exc)
                self.backend = MockPerception()
                self.mode = "mock"

    def analyze_frame(self, frame: np.ndarray, frame_id: str) -> Observation:
        return self.backend.analyze(frame, frame_id)


_engine: PerceptionEngine | None = None


def get_perception_engine() -> PerceptionEngine:
    global _engine
    if _engine is None:
        _engine = PerceptionEngine()
    return _engine


def reset_perception_engine_for_tests(engine: PerceptionEngine | None = None) -> None:
    global _engine
    _engine = engine
