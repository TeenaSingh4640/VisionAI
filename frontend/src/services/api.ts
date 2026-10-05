import type { HealthInfo, Observation, SessionState, UserPreferences } from "../types";

declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
  };
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function readConfiguredHost(): string {
  const meta = import.meta as { env?: Record<string, string | undefined> };
  const fromEnv =
    meta.env?.VITE_API_URL ||
    meta.env?.EXPO_PUBLIC_API_URL ||
    (typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined) ||
    "";
  return fromEnv.replace(/\/$/, "");
}

function isLocalBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Empty string means same-origin (Vite `/api` and `/ws` proxy in local dev). */
export const BASE_HOST = (() => {
  const configured = readConfiguredHost();
  if (configured) {
    if (typeof window !== "undefined" && !isLocalBrowserHost()) {
      try {
        const url = new URL(configured);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          console.warn(
            "[API] Ignoring localhost API URL in a deployed client. Set VITE_API_URL / EXPO_PUBLIC_API_URL to the public backend.",
          );
          return "";
        }
      } catch {
        /* keep configured value */
      }
    }
    return configured;
  }
  if (isLocalBrowserHost()) return "";
  return "";
})();

const API = `${BASE_HOST}/api`;

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError(0, "Network request failed");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export type ObservationResult = {
  observation: Observation;
  hazard: SessionState["active_hazards"][number];
  message: SessionState["last_alert"];
  activity: SessionState["activity"];
  route: SessionState["route"];
  session_status: string;
};

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
    json<ObservationResult>(`${API}/observation`, {
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
  location: (
    session_id: string,
    location: { lat: number; lon: number; heading?: number; accuracy_m?: number; timestamp?: string; simulated?: boolean },
  ) => json(`${API}/location`, { method: "POST", body: JSON.stringify({ session_id, location }) }),
};

export const sessionSocketUrl = (sessionId: string): string => {
  if (BASE_HOST) {
    const wsBase = BASE_HOST.replace(/^http:/, "ws:").replace(/^https:/, "wss:").replace(/\/$/, "");
    return `${wsBase}/ws/session/${sessionId}`;
  }
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const host = typeof window !== "undefined" ? window.location.host : "localhost";
  return `${proto}://${host}/ws/session/${sessionId}`;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffMs(attempt: number, base = 400, max = 8000): number {
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt));
  return exp + Math.floor(Math.random() * 120);
}
