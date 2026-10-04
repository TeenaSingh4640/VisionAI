import { useSession } from "../context/SessionContext";
import { AgentActivityPanel } from "../components/AgentActivityPanel";
import { CameraPanel } from "../components/CameraPanel";
import { Controls } from "../components/Controls";
import { DemoPanel } from "../components/DemoPanel";
import { Header } from "../components/Header";
import { NavigationCard } from "../components/NavigationCard";
import { Card, StatusPill } from "../components/ui";

const ASSIST_LABEL: Record<string, string> = {
  idle: "Assistant ready",
  starting: "Starting",
  active: "Assistant ready",
  paused: "Paused",
  processing: "Analyzing scene",
  attention_required: "Attention required",
  degraded: "Degraded mode",
  stopped: "Stopped",
  error: "Error",
};

export default function Dashboard() {
  const { session, connected, error, retryHealth } = useSession();
  const hazard = session?.active_hazards[0];
  const assist = ASSIST_LABEL[session?.session_status || (connected ? "idle" : "error")] || "Assistant ready";
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-3">
        {!connected && (
          <div className="lg:col-span-3 rounded-2xl border border-urgent/40 bg-urgent/10 p-4" role="alert">
            <p>{error || "Backend disconnected. Results are not current."}</p>
            <button className="mt-2 underline" onClick={() => void retryHealth()}>
              Retry connection
            </button>
          </div>
        )}
        <div className="space-y-4 lg:col-span-2">
          <CameraPanel />
          <Card title="Assistance status">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill
                label={assist}
                tone={session?.session_status === "attention_required" ? "urgent" : session?.session_status === "paused" ? "caution" : "ok"}
              />
              <p className="text-sm text-slate-300">Activity: {session?.current_agent_step || "idle"}</p>
            </div>
            <p className="mt-3 text-slate-200">{session?.last_alert?.text || "No spoken instruction yet."}</p>
            <p className="mt-2 text-sm text-slate-400">
              Latest environmental event: {session?.event_history.at(-1)?.summary || "None"}
            </p>
            {hazard && (
              <p className="mt-2 text-sm text-caution">
                Hazard: {hazard.classification.replaceAll("_", " ")} · uncertainty {Math.round(hazard.uncertainty * 100)}%
              </p>
            )}
          </Card>
          <Controls />
          <DemoPanel />
        </div>
        <div className="space-y-4">
          <NavigationCard />
          <AgentActivityPanel />
          <Card title="Recent events">
            <ul className="space-y-2 text-sm">
              {(session?.event_history || []).slice(-8).reverse().map((e, i) => (
                <li key={`${e.timestamp}-${i}`}>
                  <span className="text-slate-500">{e.type}</span> — {e.summary}
                  {e.simulated ? " (simulated)" : ""}
                </li>
              ))}
              {!session?.event_history?.length && <li className="text-slate-500">No events yet.</li>}
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}
