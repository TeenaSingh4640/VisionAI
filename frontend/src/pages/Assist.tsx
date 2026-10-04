import { useState } from "react";
import { AudioLines, Mic, Pause, Play, Volume2 } from "lucide-react";
import { Header } from "../components/Header";
import { useSession } from "../context/SessionContext";
import { isSpeechMuted, listenOnce, setSpeechMuted, speak } from "../services/voice";

export default function Assist() {
  const { session, pause, resume, stop, sendCommand } = useSession();
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(isSpeechMuted);
  const paused = session?.session_status === "paused";
  const guidance = session?.last_alert?.text || "I’m ready to describe what is around you.";
  async function voice() {
    setListening(true);
    try { await sendCommand(await listenOnce()); }
    catch { speak("Voice input is not available in this browser.", session?.user_preferences.voice_rate || 1, true); }
    finally { setListening(false); }
  }
  return (
    <div className="screen">
      <Header />
      <main className="app-main assist-main">
        <div className="active-banner"><span className="status-dot" />{session ? `Assistance ${session.session_status.replaceAll("_", " ")}` : "Start a session from Home"}<span className="sensor-chip">◉ Vision</span></div>
        <section className="monitor-card"><div className="section-eyebrow"><AudioLines size={17} /> CURRENT MONITORING MODE</div><h1>{session?.active_hazards.length ? "Reviewing a possible obstruction" : "Observing path & obstacles ahead"}</h1></section>
        <section className="guidance-card">
          <div className="guidance-heading"><span><Volume2 size={19} /> SPOKEN GUIDANCE</span><span className="voice-playing"><span className="equalizer">•••</span> Voice ready</span></div>
          <blockquote>{guidance}</blockquote>
          <button className="repeat-button" onClick={() => session?.last_alert && speak(guidance, session.user_preferences.voice_rate, true)}><AudioLines size={17} /> Repeat Instruction</button>
          <div className="audio-controls"><span>◷ Audio: Normal speed ({session?.user_preferences.voice_rate.toFixed(1) || "1.0"}x)</span><button onClick={() => { const next = !muted; setMuted(next); setSpeechMuted(next); if (!next) speak(guidance, session?.user_preferences.voice_rate || 1, true); }}><Volume2 size={15} /> {muted ? "Unmute Voice" : "Mute Voice"}</button></div>
        </section>
        <section className="voice-panel">
          <div className="voice-ready"><span>Voice Input Assistant</span><strong>{listening ? "Listening…" : "Ready for queries"}</strong></div>
          <button className={`speak-button ${listening ? "listening" : ""}`} onClick={() => void voice()} aria-label="Speak a voice command"><Mic size={25} /><span>{listening ? "LISTENING" : "SPEAK"}</span></button>
          <p>Try: “What is ahead?”, “Repeat”, or “Pause”</p>
        </section>
        <details className="camera-disclosure"><summary><span><AudioLines size={17} /> Show Camera View (High Contrast)</span><span>⌄</span></summary><p>Camera preview is available in the Scan tab. Live camera access begins only when you tap Start camera.</p></details>
        <div className="session-actions">
          <button className="pause-button" onClick={() => void (paused ? resume() : pause())}>{paused ? <Play size={18} /> : <Pause size={18} />}{paused ? "Resume Assistance" : "Pause Assistance"}</button>
          <button className="stop-button" onClick={() => void stop()}><span>■</span> Stop Assistance</button>
        </div>
        {session?.activity?.length ? <p className="agent-note">Latest agent step: {session.current_agent_step}</p> : null}
      </main>
    </div>
  );
}
