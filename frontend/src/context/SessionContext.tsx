import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../services/api";
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
  submitFrame: (dataUrl: string) => Promise<void>;
  refreshRoute: (alt?: boolean, fail?: boolean) => Promise<void>;
  updatePrefs: (prefs: Partial<UserPreferences>) => Promise<void>;
  retryHealth: () => Promise<void>;
}

const Ctx = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [developerMode, setDeveloperMode] = useState(false);
  const [cameraSource, setCameraSource] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const voiceRateRef = useRef(1);
  voiceRateRef.current = session?.user_preferences.voice_rate ?? 1;

  const retryHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
      setConnected(true);
      setError(null);
    } catch {
      setConnected(false);
      setHealth(null);
      setError("Backend is disconnected. Start the VisionMate API and retry.");
    }
  }, []);

  useEffect(() => {
    void retryHealth();
    const id = window.setInterval(() => void retryHealth(), 12000);
    return () => window.clearInterval(id);
  }, [retryHealth]);

  useEffect(() => {
    if (!session?.session_id) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/session/${session.session_id}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "session") {
        const next = data.payload as SessionState;
        setSession(next);
      } else if (data.type === "audio_event") {
        enqueueAudioEvent(data.payload as AudioEvent, voiceRateRef.current);
      }
    };
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };
    return () => ws.close();
  }, [session?.session_id]);

  const start = useCallback(async (destination: string, demoMode: boolean) => {
    setError(null);
    const created = await api.startSession(destination, demoMode);
    const state = await api.state(created.session_id);
    setSession(state);
    speak("Assistance session started. I will describe possible hazards conservatively.", state.user_preferences.voice_rate, true);
  }, []);

  const stop = useCallback(async () => {
    if (!session) return;
    await api.stopSession(session.session_id);
    const state = await api.state(session.session_id);
    setSession(state);
  }, [session]);

  const sendCommand = useCallback(
    async (command: string) => {
      if (!session) return;
      await api.command(session.session_id, command);
      if (command.trim().toLowerCase() === "repeat" && session.last_alert?.text) {
        speak(session.last_alert.text, session.user_preferences.voice_rate, true);
      }
    },
    [session],
  );

  const loadDemo = useCallback(
    async (scene: string, fail = false) => {
      if (!session) return;
      await api.demoScene(session.session_id, scene, fail);
    },
    [session],
  );

  const submitFrame = useCallback(
    async (dataUrl: string) => {
      if (!session || session.session_status === "paused" || session.session_status === "stopped") return;
      await api.observation(session.session_id, dataUrl);
    },
    [session],
  );

  const refreshRoute = useCallback(
    async (alt = false, fail = false) => {
      if (!session) return;
      if (alt) await api.alternative(session.session_id, fail);
      else await api.route(session.session_id, fail);
      setSession(await api.state(session.session_id));
    },
    [session],
  );

  const updatePrefs = useCallback(
    async (prefs: Partial<UserPreferences>) => {
      if (!session) return;
      await api.preferences(session.session_id, prefs);
      setSession(await api.state(session.session_id));
    },
    [session],
  );

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
