import { MapContainer, Polyline, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useSession } from "../context/SessionContext";

export function NavigationCard({ tall = false }: { tall?: boolean }) {
  const { session, refreshRoute } = useSession();
  const route = session?.alternative_route || session?.route;
  const geometry = (route?.geometry || []).map(([lon, lat]) => [lat, lon] as [number, number]);
  const center = geometry[0] || ([12.9716, 77.5946] as [number, number]);
  return (
    <section className="route-card">
      <div className="route-head"><div><h2>Mapped route</h2><p>For review · never verified for accessibility</p></div><span className="route-simulated">{route?.is_simulated ? "SIMULATED" : route?.provider || "No route"}</span></div>
      <div className="route-summary"><span><small>Destination</small><strong>{session?.destination || "Not set"}</strong></span><span><small>Mapped distance</small><strong>{route?.distance_m != null ? `${Math.round(route.distance_m)} m` : "—"}</strong></span></div>
      <div className={`route-map ${tall ? "large" : ""}`}><MapContainer center={center} zoom={15} className="h-full w-full" scrollWheelZoom={false} attributionControl><TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{geometry.length > 1 && <Polyline positions={geometry} color={session?.alternative_route ? "#e39316" : "#3b62dc"} />}<CircleMarker center={center} radius={8} pathOptions={{ color: "#20a86a" }} /></MapContainer></div>
      {route?.error && <p className="route-error">Route lookup failed: {route.error}</p>}
      {session?.alternative_route && <p className="route-review">Alternative route available for review. It has not been selected automatically.</p>}
      <p className="route-next"><strong>Next mapped instruction</strong><br />{route?.instructions[0]?.instruction || "No instruction yet"}</p>
      <div className="route-actions"><button onClick={() => void refreshRoute(false)}>Recalculate</button><button onClick={() => void refreshRoute(true)}>Alternative route</button></div>
    </section>
  );
}
