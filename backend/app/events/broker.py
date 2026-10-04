from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._subscribers[session_id].add(websocket)

    async def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._subscribers[session_id].discard(websocket)
            if not self._subscribers[session_id]:
                self._subscribers.pop(session_id, None)

    async def publish(self, session_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._subscribers.get(session_id, set()))
        stale: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        if stale:
            async with self._lock:
                for ws in stale:
                    self._subscribers[session_id].discard(ws)


broker = EventBroker()
