import { useState } from "react";
import { Camera, RotateCcw, Volume2 } from "lucide-react";
import { Header } from "../components/Header";
import { CameraPanel } from "../components/CameraPanel";
import { useSession } from "../context/SessionContext";
import { isSpeechMuted, setSpeechMuted, speak } from "../services/voice";

export default function Scan() {
  const { session, start, sendCommand } = useSession();
  const [audioOn, setAudioOn] = useState(() => !isSpeechMuted());
  async function describe() {
    if (!session) await start("Demo destination", true);
    else await sendCommand("describe surroundings");
  }
  return (
    <div className="screen">
      <Header />
      <main className="app-main scan-main">
        <div className="scan-toolbar"><button onClick={() => void sendCommand("pause")}>‹ Back to Home</button><span><i /> VISIONMATE SCAN</span><small>Sampled live view</small></div>
        <CameraPanel />
        <section className="scene-summary">
          <div className="scene-title"><span><Camera size={16} /> Immediate Scene</span><span className="live-label">{session?.latest_observation?.source === "demo" ? "Demo" : "Live"}</span></div>
          <p>{session?.active_hazards[0]?.reasoning || session?.latest_observation?.notes || "Tap Describe Surroundings to hear a summary of the latest view."}</p>
        </section>
        <button className="start-assistance scan-describe" onClick={() => void describe()}><span className="start-icon"><Camera size={21} /></span><strong>Describe Surroundings</strong><span className="start-arrow">›</span></button>
        <div className="scan-secondary"><button onClick={() => session?.last_alert && speak(session.last_alert.text, session.user_preferences.voice_rate, true)}><RotateCcw size={16} /> Repeat</button><button onClick={() => { const next = !audioOn; setAudioOn(next); setSpeechMuted(!next); }}><Volume2 size={16} /> Auto Audio: {audioOn ? "On" : "Off"}</button></div>
        <p className="privacy-hint">Camera starts only when you press Start camera. Raw frames are not stored.</p>
      </main>
    </div>
  );
}
