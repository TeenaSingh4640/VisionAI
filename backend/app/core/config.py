from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="VISIONMATE_", extra="ignore")

    app_name: str = "VisionMate"
    env: str = "development"
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,https://visionai-2723.onrender.com"

    perception_mode: Literal["auto", "yolo", "mock"] = "auto"
    yolo_model: str = "yolo11s.pt"
    yolo_confidence: float = 0.2
    yolo_max_detections: int = 100
    frame_max_bytes: int = 2_500_000
    inference_max_side: int = 960

    routing_provider: Literal["mock", "osrm"] = "mock"
    osrm_base_url: str = "https://router.project-osrm.org"
    osrm_profile: str = "foot"
    routing_timeout_s: float = 8.0
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "VisionMate/0.1.0 (destination search)"
    nominatim_timeout_s: float = 8.0

    sqlite_path: str = ""
    obs_min_interval_ms: int = 350
    turn_thresholds_m: str = "500,200,50"

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
