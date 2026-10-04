import { Eye } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-blue-900/40">
        <Eye aria-hidden size={22} />
      </span>
      {!compact && (
        <div>
          <p className="font-display text-lg font-semibold leading-none">VisionMate</p>
          <p className="mt-1 text-xs text-slate-400">Visual assistance prototype</p>
        </div>
      )}
    </div>
  );
}

export function StatusPill({
  label,
  tone = "ok",
}: {
  label: string;
  tone?: "ok" | "caution" | "urgent" | "info";
}) {
  const map = {
    ok: "bg-ok/15 text-ok border-ok/40",
    caution: "bg-caution/15 text-caution border-caution/40",
    urgent: "bg-urgent/15 text-urgent border-urgent/40",
    info: "bg-accent/15 text-sky-300 border-accent/40",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${map[tone]}`}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

export function Card({
  title,
  children,
  className = "",
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-slate-700/80 bg-navy-900/80 p-4 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-base font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function BigButton({
  children,
  onClick,
  tone = "primary",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "primary" | "neutral" | "danger" | "warn";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const tones = {
    primary: "bg-accent hover:bg-blue-500 text-white",
    neutral: "bg-navy-700 hover:bg-navy-800 text-white border border-slate-600",
    danger: "bg-urgent hover:bg-red-500 text-white",
    warn: "bg-caution hover:bg-amber-400 text-navy-950",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 rounded-xl px-4 py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
