import { useEffect, useRef, useState } from "react";
import { Header } from "../components/Header";
import { NavigationCard } from "../components/NavigationCard";
import { useSession } from "../context/SessionContext";
import { api } from "../services/api";

export default function Navigate() {
  const { session } = useSession();
  const watchRef = useRef<number | null>(null);
  const [watching, setWatching] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const route = session?.route;

  const stopGps = () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setWatching(false);
  };

  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  const startGps = () => {
    if (!session || !navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }
    setLocationMessage("Waiting for a location fix…");
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const c = position.coords;
        void api.location(session.session_id, {
          lat: c.latitude, lon: c.longitude, accuracy_m: c.accuracy,
          heading: c.heading ?? undefined, timestamp: new Date(position.timestamp).toISOString(), simulated: false,
        }).then(() => setLocationMessage(`Location active · accuracy ±${Math.round(c.accuracy)} m`))
          .catch(() => setLocationMessage("Could not send location to VisionMate."));
      },
      (error) => { setLocationMessage(error.code === 1 ? "Location permission was denied." : "Could not get a reliable location fix."); stopGps(); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    setWatching(true);
  };

  const simulateThreshold = async (meters: number) => {
    const turn = route?.instructions.find((step) => step.maneuver_location && step.maneuver_type !== "arrive");
    if (!session || !turn?.maneuver_location) return;
    const [lon, lat] = turn.maneuver_location;
    const latOffset = meters / 111_320;
    await api.location(session.session_id, {
      lat: lat - latOffset, lon, accuracy_m: 3, timestamp: new Date().toISOString(), simulated: true,
    });
    setLocationMessage(`Demo location sent (${meters} m from mapped turn). Guidance is simulated.`);
  };

  return <div className="screen"><Header /><main className="app-main navigation-main">
    <h1>Navigation</h1>
    <p>Mapped directions are for review. Location based prompts describe the route and do not confirm that a path is clear or accessible.</p>
    <section className="route-card">
      <h2>Location guidance</h2>
      <p>{locationMessage || "Location is off. Turn it on to receive mapped turn prompts."}</p>
      <div className="route-actions">
        {!watching ? <button onClick={startGps}>Turn on location</button> : <button onClick={stopGps}>Turn off location</button>}
      </div>
      {session?.demo_mode && route?.is_simulated && <>
        <p>Developer demo · simulated GPS fixes only</p>
        <div className="route-actions">{[500, 200, 100, 30].map((meters) => <button key={meters} onClick={() => void simulateThreshold(meters)}>Simulate {meters} m</button>)}</div>
      </>}
    </section>
    <NavigationCard tall />
    {session?.alternative_route && <div className="route-review-card"><strong>Alternative route needs your review</strong><p>VisionMate will not select or guide you onto this route automatically.</p></div>}
  </main></div>;
}
