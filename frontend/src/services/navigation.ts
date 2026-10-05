import type { DetectedObject, RouteResult } from "../types";

export interface NavigationStep {
  instruction: string;
  distanceMeters: number;
  maneuver: "straight" | "left" | "right" | "slight-right" | "slight-left" | "destination";
  coordinates: [number, number];
  spoken: boolean;
}

export interface RoutePlan {
  destination: string;
  totalDistanceMeters: number;
  steps: NavigationStep[];
}

export interface RouteProgress {
  distanceMeters: number;
  advanced: boolean;
  completed: boolean;
  step: NavigationStep | null;
  spoken: boolean;
}

function toManeuver(
  maneuverType?: string | null,
  modifier?: string | null,
): NavigationStep["maneuver"] {
  const value = `${maneuverType || ""} ${modifier || ""}`.toLowerCase();
  if (value.includes("arrive") || value.includes("destination")) return "destination";
  if (value.includes("slight") && value.includes("left")) return "slight-left";
  if (value.includes("slight") && value.includes("right")) return "slight-right";
  if (value.includes("left")) return "left";
  if (value.includes("right")) return "right";
  return "straight";
}

export function routeResultToPlan(route: RouteResult, destination: string): RoutePlan {
  const fallback = route.geometry[0] || [0, 0];
  return {
    destination,
    totalDistanceMeters: route.distance_m ?? 0,
    steps: route.instructions.map((step) => ({
      instruction: step.instruction,
      distanceMeters: step.distance_m,
      maneuver: toManeuver(step.maneuver_type, step.maneuver_modifier),
      coordinates: (step.maneuver_location?.length === 2
        ? [step.maneuver_location[0], step.maneuver_location[1]]
        : fallback) as [number, number],
      spoken: false,
    })),
  };
}

function distanceMeters(lat: number, lon: number, coordinates: [number, number]) {
  const [targetLon, targetLat] = coordinates;
  const earthRadius = 6_371_000;
  const lat1 = (lat * Math.PI) / 180;
  const lat2 = (targetLat * Math.PI) / 180;
  const deltaLat = ((targetLat - lat) * Math.PI) / 180;
  const deltaLon = ((targetLon - lon) * Math.PI) / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class RouteTracker {
  private stepIndex = 0;
  private readonly plan: RoutePlan;
  private readonly onStepAdvanced?: (step: NavigationStep) => void;

  constructor(plan: RoutePlan, onStepAdvanced?: (step: NavigationStep) => void) {
    this.plan = plan;
    this.onStepAdvanced = onStepAdvanced;
  }

  get currentStepIndex() {
    return this.stepIndex;
  }

  get currentStep() {
    return this.plan.steps[this.stepIndex] || null;
  }

  comparePosition(currentLat: number, currentLon: number): RouteProgress {
    const step = this.currentStep;
    if (!step) return { distanceMeters: 0, advanced: false, completed: true, step: null, spoken: false };

    const distance = distanceMeters(currentLat, currentLon, step.coordinates);
    if (distance > 10) {
      return { distanceMeters: distance, advanced: false, completed: false, step, spoken: step.spoken };
    }

    step.spoken = true;
    this.stepIndex += 1;
    this.onStepAdvanced?.(step);
    const next = this.currentStep;
    return {
      distanceMeters: distance,
      advanced: true,
      completed: !next,
      step: next,
      spoken: true,
    };
  }

  getCompositeAlert(nextTurnInstruction: string, activeObstacles: DetectedObject[]) {
    const obstacle = activeObstacles.find((item) => item.confidence >= 0.8);
    if (!obstacle) return nextTurnInstruction;
    const name = obstacle.class_name.replace(/_/g, " ");
    if (!nextTurnInstruction) return `Caution: ${name} ahead. Please pause and reassess.`;
    return `Caution: ${name} ahead. ${nextTurnInstruction}`;
  }
}
