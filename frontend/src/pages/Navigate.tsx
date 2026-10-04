import { Header } from "../components/Header";
import { NavigationCard } from "../components/NavigationCard";
import { useSession } from "../context/SessionContext";
import { Card } from "../components/ui";

export default function Navigate() {
  const { session } = useSession();
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <h1 className="font-display text-2xl">Navigation</h1>
        <p className="text-slate-400">
          Mapped geometry is for review only. VisionMate never labels a route as safe or accessible.
        </p>
        <NavigationCard tall />
        <Card title="Route details">
          <p>Provider: {session?.route?.provider || "none"}</p>
          <p>Simulated: {session?.route?.is_simulated ? "yes" : "no"}</p>
          {session?.route?.error && <p className="text-urgent">Routing error: {session.route.error}</p>}
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-300">
            {(session?.alternative_route || session?.route)?.instructions.map((i, idx) => (
              <li key={idx}>
                {i.instruction} ({Math.round(i.distance_m)} m mapped)
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </div>
  );
}
