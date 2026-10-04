import { CameraPanel } from "../components/CameraPanel";
import { Controls } from "../components/Controls";
import { Header } from "../components/Header";
import { AgentActivityPanel } from "../components/AgentActivityPanel";
import { useSession } from "../context/SessionContext";
import { Card, StatusPill } from "../components/ui";

export default function Assist() {
  const { session } = useSession();
  const uncertain = session?.active_hazards.some((h) => h.classification === "uncertain");
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl">Live assistance</h1>
          <StatusPill label={session?.session_status?.replaceAll("_", " ") || "idle"} tone={uncertain ? "caution" : "info"} />
          {uncertain && <StatusPill label="Uncertain visual situation" tone="caution" />}
        </div>
        <CameraPanel />
        <Card title="Recent voice guidance">
          <p className="text-lg">{session?.last_alert?.text || "No guidance yet."}</p>
          <p className="mt-2 text-sm text-slate-400">Agent: {session?.current_agent_step || "idle"}</p>
        </Card>
        <Controls />
        <AgentActivityPanel />
      </main>
    </div>
  );
}
