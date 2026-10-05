from __future__ import annotations

import asyncio
import time

import httpx

from app.core.config import get_settings
from app.schemas.models import PlaceCandidate


class NominatimPlaceSearch:
    """User-triggered, cached and rate-limited Nominatim lookups."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._last_request = 0.0
        self._cache: dict[str, list[PlaceCandidate]] = {}

    async def search(self, query: str) -> list[PlaceCandidate]:
        key = " ".join(query.casefold().split())
        if key in self._cache:
            return list(self._cache[key])
        settings = get_settings()
        async with self._lock:
            if key in self._cache:
                return list(self._cache[key])
            wait = 1.05 - (time.monotonic() - self._last_request)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request = time.monotonic()
            url = f"{settings.nominatim_base_url.rstrip('/')}/search"
            try:
                async with httpx.AsyncClient(timeout=settings.nominatim_timeout_s) as client:
                    response = await client.get(
                        url,
                        params={"q": query, "format": "jsonv2", "limit": 5, "addressdetails": 1},
                        headers={"User-Agent": settings.nominatim_user_agent},
                    )
                    response.raise_for_status()
                    items = response.json()
            except Exception as exc:
                raise PlaceSearchError("Place search is temporarily unavailable. Please try again.") from exc
            if not isinstance(items, list):
                raise PlaceSearchError("Place search returned an invalid response. Please try again.")
            places: list[PlaceCandidate] = []
            for item in items[:5]:
                try:
                    display = str(item["display_name"])
                    pieces = [part.strip() for part in display.split(",")]
                    places.append(PlaceCandidate(
                        place_id=str(item["place_id"]),
                        name=pieces[0] if pieces else display,
                        context=", ".join(pieces[1:4]),
                        lat=float(item["lat"]), lon=float(item["lon"]),
                    ))
                except (KeyError, TypeError, ValueError):
                    continue
            self._cache[key] = places
            if len(self._cache) > 300:
                self._cache.pop(next(iter(self._cache)))
            return list(places)


class PlaceSearchError(RuntimeError):
    pass


_searcher = NominatimPlaceSearch()


def get_place_searcher() -> NominatimPlaceSearch:
    return _searcher
