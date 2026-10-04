import { useSession } from "../context/SessionContext";
import { BigButton, Card } from "./ui";

const SCENES = [
  { id: "clear", label: "Load clear scene" },
  { id: "blocked", label: "Load blocked scene" },
  { id: "uncertain", label: "Load uncertain scene" },
  { id: "pedestrian", label: "Temporary pedestrian" },
  { id: "obstacle_removed", label: "Simulate obstacle removal" },
];

export function DemoPanel() {
  const { session, loadDemo } = useSession();
  if (!session) return null;
  return (
    <Card title="Hackathon demonstration">
      <p className="mb-3 text-sm text-slate-400">
        Controlled scenes inject labeled simulated detections. They are not live camera truth.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SCENES.map((s) => (
          <BigButton key={s.id} tone="neutral" onClick={() => void loadDemo(s.id)}>
            {s.label}
          </BigButton>
        ))}
        <BigButton tone="warn" onClick={() => void loadDemo("route_failure", true)}>
          Simulate route API failure
        </BigButton>
        <BigButton tone="neutral" onClick={() => void loadDemo("reset")}>
          Reset demo
        </BigButton>
      </div>
    </Card>
  );
}
