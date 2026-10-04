export type SessionStatus =
  | "idle"
  | "starting"
  | "active"
  | "paused"
  | "processing"
  | "attention_required"
  | "degraded"
  | "stopped"
  | "error";

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DetectedObject {
  class_name: string;
  confidence: number;
  bbox: BoundingBox;
  track_id: number | null;
}

export interface Observation {
  timestamp: string;
  frame_id: string;
  objects: DetectedObject[];
  processing_ms: number;
  source: "yolo" | "mock" | "demo" | "uploaded";
  quality: string;
  notes?: string | null;
}

export interface HazardEvent {
  classification: string;
  priority: string;
  confidence: number;
  uncertainty: number;
  reasoning: string;
  recommended_action: string;
  affecting_route: boolean;
  object_ids: number[];
}

export interface RouteInstruction {
  instruction: string;
  distance_m: number;
}

export interface RouteResult {
  route_id: string;
  provider: string;
  status: string;
  distance_m: number | null;
  duration_s: number | null;
  instructions: RouteInstruction[];
  geometry: number[][];
  is_simulated: boolean;
  error?: string | null;
  alternative_available: boolean;
}

export interface CommunicationMessage {
  text: string;
  category: string;
  speak: boolean;
}

export interface AgentActivity {
  timestamp: string;
  step: string;
  agent: string;
  reason: string;
  tool?: string | null;
  result?: string | null;
  next_action?: string | null;
  confidence?: number | null;
  waiting_for_observation: boolean;
  simulated: boolean;
}

export interface SessionEvent {
  timestamp: string;
  type: string;
  summary: string;
  details: Record<string, unknown>;
  simulated: boolean;
}

export interface UserPreferences {
  voice_rate: number;
  verbosity: "minimal" | "balanced" | "detailed";
  scene_descriptions: boolean;
  demo_mode: boolean;
  reduced_visuals: boolean;
}

export interface SessionState {
  session_id: string;
  user_goal: string;
  destination: string;
  route: RouteResult | null;
  alternative_route: RouteResult | null;
  latest_observation: Observation | null;
  active_hazards: HazardEvent[];
  event_history: SessionEvent[];
  activity: AgentActivity[];
  last_alert: CommunicationMessage | null;
  current_agent_step: string;
  pending_tool: string | null;
  retry_count: number;
  user_preferences: UserPreferences;
  connectivity_status: string;
  session_status: SessionStatus;
  demo_mode: boolean;
  last_observation_at: string | null;
}

export interface HealthInfo {
  ok: boolean;
  perception: string;
  routing: string;
  safety: string;
}
