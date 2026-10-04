import type { HealthInfo, Observation, SessionState, UserPreferences } from "../types";

const API = "/api";

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => json<HealthInfo>(`${API}/health`),
  startSession: (destination: string, demoMode: boolean, preferences?: UserPreferences) =>
    json<{
      session_id: string;
      status: string;
      demo_mode: boolean;
      perception_mode: string;
      routing_provider: string;
      safety_notice: string;
    }>(`${API}/session/start`, {
      method: "POST",
      body: JSON.stringify({ destination, demo_mode: demoMode, preferences }),
    }),
  stopSession: (session_id: string) =>
    json(`${API}/session/stop`, { method: "POST", body: JSON.stringify({ session_id }) }),
  observation: (session_id: string, image_base64?: string, demo_scene?: string) =>
    json<{
      observation: Observation;
      hazard: SessionState["active_hazards"][number];
      message: SessionState["last_alert"];
      activity: SessionState["activity"];
      route: SessionState["route"];
      session_status: string;
    }>(`${API}/observation`, {
      method: "POST",
      body: JSON.stringify({ session_id, image_base64, demo_scene }),
    }),
  demoScene: (session_id: string, scene: string, simulate_route_failure = false) =>
    json(`${API}/demo/scene`, {
      method: "POST",
      body: JSON.stringify({ session_id, scene, simulate_route_failure }),
    }),
  command: (session_id: string, command: string) =>
    json(`${API}/command`, { method: "POST", body: JSON.stringify({ session_id, command }) }),
  state: (session_id: string) => json<SessionState>(`${API}/session/${session_id}/state`),
  route: (session_id: string, simulate_failure = false) =>
    json(`${API}/navigation/route`, { method: "POST", body: JSON.stringify({ session_id, simulate_failure }) }),
  alternative: (session_id: string, simulate_failure = false) =>
    json(`${API}/navigation/alternative`, {
      method: "POST",
      body: JSON.stringify({ session_id, simulate_failure }),
    }),
  preferences: (session_id: string, prefs: Partial<UserPreferences>) =>
    json(`${API}/session/${session_id}/preferences`, { method: "PATCH", body: JSON.stringify(prefs) }),
};
