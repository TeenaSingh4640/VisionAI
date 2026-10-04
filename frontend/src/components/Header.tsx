import { NavLink } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { useSession } from "../context/SessionContext";
import { Logo, StatusPill } from "./ui";

export function Header() {
  const { connected, session, health } = useSession();
  const status = session?.session_status || (connected ? "idle" : "error");
  const tone =
    status === "attention_required" || status === "error"
      ? "urgent"
      : status === "paused" || status === "degraded"
        ? "caution"
        : connected
          ? "ok"
          : "urgent";
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-navy-950/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-4 text-sm md:flex" aria-label="Primary">
          <NavLink className="hover:text-white" to="/app">
            Dashboard
          </NavLink>
          <NavLink className="hover:text-white" to="/app/assist">
            Live assistance
          </NavLink>
          <NavLink className="hover:text-white" to="/app/navigate">
            Navigation
          </NavLink>
        </nav>
        <div className="flex items-center gap-3">
          <StatusPill label={connected ? `System ${status.replace("_", " ")}` : "Backend disconnected"} tone={tone} />
          {health && <span className="hidden text-xs text-slate-400 lg:inline">Perception: {health.perception}</span>}
          <NavLink to="/app/settings" aria-label="Settings" className="rounded-xl border border-slate-700 p-2">
            <SettingsIcon size={20} />
          </NavLink>
        </div>
      </div>
    </header>
  );
}
