import { useSession } from "../context/SessionContext";
import { Card } from "./ui";

export function AgentActivityPanel() {
  const { session } = useSession();
  const items = [...(session?.activity || [])].slice(-12).reverse();
  return (
    <Card title="Agentic AI Activity">
      <p className="mb-3 text-sm text-slate-400">
        Current step: <strong className="text-slate-100">{session?.current_agent_step || "idle"}</strong>
        {session?.pending_tool ? ` · pending ${session.pending_tool}` : ""}
      </p>
      <ol className="space-y-3" aria-live="polite">
        {items.length === 0 && <li className="text-sm text-slate-500">No orchestrator activity yet.</li>}
        {items.map((item, idx) => (
          <li key={`${item.timestamp}-${idx}`} className="rounded-xl border border-slate-700 bg-navy-800/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                {item.agent} · {item.step}
                {item.simulated ? " · simulated" : ""}
              </span>
              <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleTimeString()}</time>
            </div>
            <p className="mt-1 text-sm">{item.reason}</p>
            {item.tool && <p className="mt-1 text-xs text-sky-300">Tool: {item.tool}</p>}
            {item.result && <p className="mt-1 text-xs text-slate-300">Result: {item.result}</p>}
            {item.next_action && <p className="mt-1 text-xs text-slate-400">Next: {item.next_action}</p>}
            {item.waiting_for_observation && <p className="mt-1 text-xs text-caution">Waiting for a new observation</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
