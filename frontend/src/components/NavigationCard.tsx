import { MapContainer, Polyline, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useSession } from "../context/SessionContext";
import { BigButton, Card, StatusPill } from "./ui";

export function NavigationCard({ tall = false }: { tall?: boolean }) {
  const { session, refreshRoute } = useSession();
  const route = session?.alternative_route || session?.route;
  const geometry = (route?.geometry || []).map(([lon, lat]) => [lat, lon] as [number, number]);
  const center = geometry[0] || ([12.9716, 77.5946] as [number, number]);

  return (
    <Card
      title="Navigation"
      className={tall ? "h-full" : ""}
      actions={
        <StatusPill
          label={route?.is_simulated ? "Simulated routing" : `Provider: ${route?.provider || "none"}`}
          tone="info"
        />
      }
    >
      <p className="text-sm text-slate-300">Destination: {session?.destination || "Not set"}</p>
      <p className="mt-1 text-sm text-slate-400">
        Route status: {route?.status || "none"} ·{" "}
        {route?.distance_m != null ? `${Math.round(route.distance_m)} m mapped` : "no distance"}
      </p>
      <p className="mt-2 text-sm">
        Next mapped instruction: {route?.instructions[0]?.instruction || "No instruction yet"}
      </p>
      {session?.alternative_route && (
        <p className="mt-2 text-caution">Alternative route available for review. It is not selected automatically and is not labeled safe.</p>
      )}
      <div className={`mt-3 overflow-hidden rounded-xl ${tall ? "h-72" : "h-48"}`}>
        <MapContainer center={center} zoom={15} className="h-full w-full" scrollWheelZoom={false} attributionControl>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {geometry.length > 1 && <Polyline positions={geometry} color={session?.alternative_route ? "#f59e0b" : "#3b82f6"} />}
          <CircleMarker center={center} radius={8} pathOptions={{ color: "#22c55e" }} />
        </MapContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <BigButton tone="neutral" onClick={() => void refreshRoute(false)}>
          Recalculate mapped route
        </BigButton>
        <BigButton tone="neutral" onClick={() => void refreshRoute(true)}>
          Request alternative for review
        </BigButton>
      </div>
    </Card>
  );
}
