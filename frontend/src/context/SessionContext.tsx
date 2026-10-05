import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, backoffMs, isApiError, sessionSocketUrl, sleep, type ObservationResult } from "../services/api";
import { enqueueAudioEvent, speak } from "../services/voice";
import type { AudioEvent, HealthInfo, SessionState, UserPreferences } from "../types";

interface SessionContextValue {
  health: HealthInfo | null;
  connected: boolean;
  session: SessionState | null;
  error: string | null;
  developerMode: boolean;
  setDeveloperMode: (v: boolean) => void;
  cameraSource: string;
  setCameraSource: (v: string) => void;
  start: (destination: string, demoMode: boolean) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  sendCommand: (command: string) => Promise<void>;
  loadDemo: (scene: string, fail?: boolean) => Promise<void>;
  submitFrame: (dataUrl: string) => void;
  refreshRoute: (alt?: boolean, fail?: boolean) => Promise<void>;
  updatePrefs: (prefs: Partial<UserPreferences>) => Promise<void>;
  retryHealth: () => Promise<void>;
}

const Ctx = createContext<SessionContextValue | null>(null);
const MAX_WS_RETRIES = 8;
const STATE_POLL_MS = 2000;

function mergeObservation(prev: SessionState, result: ObservationResult): SessionState {
  return {
    ...prev,
    latest_observation: result.observation,
    active_hazards: result.hazard ? [result.hazard] : prev.active_hazards,
    last_alert: result.message,
    activity: result.activity?.length ? result.activity : prev.activity,
    route: result.route ?? prev.route,
    session_status: (result.session_status as SessionState["session_status"]) || prev.session_status,
    last_observation_at: result.observation?.timestamp ?? prev.last_observation_at,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [developerMode, setDeveloperMode] = useState(false);
  const [cameraSource, setCameraSource] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const wsAliveRef = useRef(false);
  const sessionRef = useRef<SessionState | null>(null);
  const healthInFlight = useRef(false);
  const stateInFlight = useRef(false);
  const observationInFlight = useRef(false);
  const latestFrame = useRef<string | null>(null);
  const voiceRateRef = useRef(1);
  sessionRef.current = session;
  voiceRateRef.current = session?.user_preferences.voice_rate ?? 1;

  const retryHealth = useCallback(async () => {
    if (healthInFlight.current) return;
    healthInFlight.current = true;
    try {
      const h = await api.health();
      setHealth(h);
      setConnected(true);
      setError((prev) => (prev?.startsWith("Backend is disconnected") ? null : prev));
    } catch {
      setConnected(false);
      setHealth(null);
      setError("Backend is disconnected. Start the VisionMate API and retry.");
    } finally {
      healthInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void retryHealth();
    const id = window.setInterval(() => void retryHealth(), 12000);
    return () => window.clearInterval(id);
  }, [retryHealth]);

  useEffect(() => {
    const sessionId = session?.session_id;
    const stopped = session?.session_status === "stopped";
    if (!sessionId || stopped) {
      wsRef.current?.close();
      wsRef.current = null;
      wsAliveRef.current = false;
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | undefined;
    let attempts = 0;

    const connect = () => {
      if (cancelled) return;
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const url = sessionSocketUrl(sessionId);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        attempts = 0;
        wsAliveRef.current = true;
        console.log("[WebSocket] connected");
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "session") {
            setSession(data.payload as SessionState);
          } else if (data.type === "audio_event") {
            enqueueAudioEvent(data.payload as AudioEvent, voiceRateRef.current);
          }
        } catch {
          /* Ignore malformed events so a bad payload cannot crash the app. */
        }
      };
      ws.onerror = () => {
        /* onclose handles retry; avoid throwing into React. */
      };
      ws.onclose = () => {
        wsAliveRef.current = false;
        if (wsRef.current === ws) wsRef.current = null;
        console.log("[WebSocket] disconnected");
        if (cancelled || sessionRef.current?.session_status === "stopped") return;
        if (attempts >= MAX_WS_RETRIES) {
          setError("Live updates are paused. Status will refresh when the backend is available.");
          return;
        }
        const delay = backoffMs(attempts, 600, 15000);
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
      wsAliveRef.current = false;
    };
  }, [session?.session_id, session?.session_status === "stopped"]);

  useEffect(() => {
    const sessionId = session?.session_id;
    if (!sessionId || session?.session_status === "stopped") return;
    const poll = async () => {
      if (stateInFlight.current) return;
      if (wsAliveRef.current) return;
      stateInFlight.current = true;
      console.log("[State] polling request started");
      try {
        const next = await api.state(sessionId);
        setSession(next);
        setError((prev) => (prev?.includes("temporarily unavailable") ? null : prev));
        console.log("[State] polling request completed");
      } catch (err) {
        if (isApiError(err) && (err.status === 502 || err.status === 503 || err.status === 0)) {
          setError("Backend temporarily unavailable. Retrying status updates…");
        }
      } finally {
        stateInFlight.current = false;
      }
    };
    const id = window.setInterval(() => void poll(), STATE_POLL_MS);
    return () => window.clearInterval(id);
  }, [session?.session_id, session?.session_status]);

  const start = useCallback(async (destination: string, demoMode: boolean) => {
    setError(null);
    try {
      const created = await api.startSession(destination, demoMode);
      const state = await api.state(created.session_id);
      setSession(state);
      speak("Assistance session started. I will describe possible hazards conservatively.", state.user_preferences.voice_rate, true);
    } catch (err) {
      const unavailable = isApiError(err) && (err.status === 502 || err.status === 503 || err.status === 0);
      setError(unavailable ? "Backend temporarily unavailable. Try starting the session again." : "Could not start the assistance session.");
    }
  }, []);

  const stop = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    latestFrame.current = null;
    try {
      await api.stopSession(current.session_id);
      const state = await api.state(current.session_id);
      setSession(state);
    } catch {
      setSession((prev) => (prev ? { ...prev, session_status: "stopped" } : prev));
    }
  }, []);

  const sendCommand = useCallback(async (command: string) => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      await api.command(current.session_id, command);
      if (command.trim().toLowerCase() === "repeat" && current.last_alert?.text) {
        speak(current.last_alert.text, current.user_preferences.voice_rate, true);
      }
    } catch (err) {
      if (isApiError(err) && (err.status === 502 || err.status === 0)) {
        setError("Backend temporarily unavailable.");
      }
    }
  }, []);

  const loadDemo = useCallback(async (scene: string, fail = false) => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      await api.demoScene(current.session_id, scene, fail);
    } catch (err) {
      if (isApiError(err) && (err.status === 502 || err.status === 0)) {
        setError("Backend temporarily unavailable.");
      }
    }
  }, []);

  const pumpObservations = useCallback(async () => {
    if (observationInFlight.current) return;
    observationInFlight.current = true;
    let rateFailures = 0;
    try {
      while (latestFrame.current) {
        const current = sessionRef.current;
        if (!current || current.session_status === "paused" || current.session_status === "stopped") {
          latestFrame.current = null;
          break;
        }
        const frameToSend = latestFrame.current;
        latestFrame.current = null;
        const started = performance.now();
        console.log("[Observation] request started");
        try {
          const result = await api.observation(current.session_id, frameToSend);
          rateFailures = 0;
          console.log(`[Observation] request completed in ${Math.round(performance.now() - started)} ms`);
          setSession((prev) => (prev && prev.session_id === current.session_id ? mergeObservation(prev, result) : prev));
          setError((prev) => (prev?.includes("temporarily unavailable") ? null : prev));
        } catch (err) {
          if (isApiError(err) && err.status === 429) {
            console.log("[Observation] backend returned 429");
            const wait = backoffMs(rateFailures, 500, 6000);
            rateFailures += 1;
            await sleep(wait);
            continue;
          }
          if (isApiError(err) && (err.status === 409)) {
            latestFrame.current = null;
            break;
          }
          if (isApiError(err) && (err.status === 502 || err.status === 503 || err.status === 0)) {
            setError("Backend temporarily unavailable. Camera frames will resume after a short wait.");
            await sleep(backoffMs(rateFailures, 800, 8000));
            rateFailures += 1;
            if (rateFailures >= 6) {
              latestFrame.current = null;
              break;
            }
            continue;
          }
          console.warn("[Observation] request failed", isApiError(err) ? err.status : err);
          break;
        }
      }
    } finally {
      observationInFlight.current = false;
    }
    if (latestFrame.current) void pumpObservations();
  }, []);

  const submitFrame = useCallback(
    (dataUrl: string) => {
      const current = sessionRef.current;
      if (!current || current.session_status === "paused" || current.session_status === "stopped") return;
      latestFrame.current = dataUrl;
      if (observationInFlight.current) {
        console.log("[Observation] frame dropped because request is in flight");
        return;
      }
      void pumpObservations();
    },
    [pumpObservations],
  );

  const refreshRoute = useCallback(async (alt = false, fail = false) => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      if (alt) await api.alternative(current.session_id, fail);
      else await api.route(current.session_id, fail);
      setSession(await api.state(current.session_id));
    } catch (err) {
      if (isApiError(err) && (err.status === 502 || err.status === 0)) {
        setError("Backend temporarily unavailable.");
      }
    }
  }, []);

  const updatePrefs = useCallback(async (prefs: Partial<UserPreferences>) => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      await api.preferences(current.session_id, prefs);
      setSession(await api.state(current.session_id));
    } catch (err) {
      if (isApiError(err) && (err.status === 502 || err.status === 0)) {
        setError("Backend temporarily unavailable.");
      }
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      health,
      connected,
      session,
      error,
      developerMode,
      setDeveloperMode,
      cameraSource,
      setCameraSource,
      start,
      stop,
      pause: () => sendCommand("pause"),
      resume: () => sendCommand("resume"),
      sendCommand,
      loadDemo,
      submitFrame,
      refreshRoute,
      updatePrefs,
      retryHealth,
    }),
    [
      health,
      connected,
      session,
      error,
      developerMode,
      cameraSource,
      start,
      stop,
      sendCommand,
      loadDemo,
      submitFrame,
      refreshRoute,
      updatePrefs,
      retryHealth,
    ],
  );

  return createElement(Ctx.Provider, { value }, children);
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
