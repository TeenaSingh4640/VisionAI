import { Link } from "react-router-dom";
import { ArrowRight, AudioLines, Camera, ChevronRight, LocateFixed, Mic, Settings2, Sparkles, Volume2 } from "lucide-react";
import { Header } from "../components/Header";
import { CameraPanel } from "../components/CameraPanel";
import { useSession } from "../context/SessionContext";
import { listenOnce, speak } from "../services/voice";

function saveDisplayPreference(key: string, value: string) {
  document.documentElement.dataset[key] = value;
  try {
    const stored = JSON.parse(localStorage.getItem("visionmate-comfort") || "{}");
    localStorage.setItem("visionmate-comfort", JSON.stringify({ ...stored, [key === "text" ? "textSize" : "contrast"]: value }));
  } catch { /* The visual preference still applies for this page. */ }
}

export default function Dashboard() {
  const { session, connected, start, sendCommand, loadDemo } = useSession();
  const ready = session?.session_status === "active";
  const message = session?.last_alert?.text || "Tap the main button below or speak naturally anytime.";

  async function begin() {
    if (!session || session.session_status === "stopped") await start("Demo destination", true);
    else await sendCommand("resume");
  }

  async function voiceCommand() {
    try { await sendCommand(await listenOnce()); }
    catch { speak("Voice commands are unavailable. Tap Start Assistance to begin.", session?.user_preferences.voice_rate || 1, true); }
  }

  return (
    <div className="screen">
      <Header />
      <main className="app-main home-main">
        {!connected && <div className="connection-banner" role="alert">Backend disconnected. Current visual results may be out of date.</div>}
        <div className="accessibility-shortcuts" aria-label="Display shortcuts">
          <span className="shortcut-label">Display</span>
          <button onClick={() => saveDisplayPreference("text", "standard")}>◉ Standard</button>
          <button onClick={() => saveDisplayPreference("text", "large")}>Tt Large</button>
          <button onClick={() => saveDisplayPreference("contrast", document.documentElement.dataset.contrast === "high" ? "standard" : "high")}>◐ Contrast</button>
        </div>

        <section className="welcome-card">
          <div className="ready-line"><span className={`status-dot ${ready ? "" : "idle"}`} />{ready ? "Your assistant is ready" : "Your assistant is ready"}<button className="voice-mini" aria-label="Play welcome message" onClick={() => speak(message, session?.user_preferences.voice_rate || 1, true)}><Volume2 size={17} /></button></div>
          <h1>Hello! I’m ready to help.</h1>
          <p>{message}</p>
        </section>

        <button className="start-assistance" onClick={() => void begin()}>
          <span className="start-icon"><Camera size={23} /></span>
          <span><strong>{ready ? "Resume Assistance" : "Start Assistance"}</strong><small>Auditory & visual guidance</small></span>
          <span className="start-arrow"><ArrowRight size={21} /></span>
        </button>
        <button className="voice-command" onClick={() => void voiceCommand()}>
          <span><Mic size={17} /> Or say, <strong>“Start assistance”</strong></span><span className="mic-bubble"><Mic size={18} /></span>
        </button>

        <section className="home-camera-preview">
          <div className="home-camera-header">
            <span><Camera size={16} /> Live Camera</span>
            <Link to="/app/scan" className="home-camera-expand">Full scan <ChevronRight size={14} /></Link>
          </div>
          <CameraPanel />
        </section>

        <section className="quick-section">
          <h2>Quick Actions</h2>
          <Link to="/app/scan" className="quick-action">
            <span className="quick-icon lavender"><Camera size={19} /></span><span><strong>Describe Surroundings</strong><small>Instant audio scene summary</small></span><ChevronRight size={18} />
          </Link>
          <Link to="/app/navigate" className="quick-action">
            <span className="quick-icon mint"><LocateFixed size={19} /></span><span><strong>Navigate to Destination</strong><small>Spatial turns & path alerts</small></span><ChevronRight size={18} />
          </Link>
          <Link to="/app/settings" className="quick-action">
            <span className="quick-icon lavender"><Settings2 size={19} /></span><span><strong>Accessibility Settings</strong><small>Speech speed, haptics & contrast</small></span><ChevronRight size={18} />
          </Link>
        </section>

        <a className="help-card" href="tel:112"><span className="help-icon">!</span><span><strong>Need immediate help?</strong><small>Tap to call local emergency services</small></span><span className="help-action">Call 112</span></a>

        {session && <>
          <details className="demo-scenes"><summary><Sparkles size={15} /> Demo controls <span>Simulated scenes</span></summary><div>{[{ id: "clear", label: "Clear" }, { id: "blocked", label: "Blocked" }, { id: "uncertain", label: "Uncertain" }, { id: "obstacle_removed", label: "Cleared" }].map((scene) => <button key={scene.id} onClick={() => void loadDemo(scene.id)}>{scene.label}</button>)}</div></details>
          {!!session.activity.length && <section className="home-activity"><div><strong>Agentic AI Activity</strong><Link to="/app/assist">View details <ChevronRight size={13} /></Link></div>{session.activity.slice(-2).reverse().map((item, i) => <p key={`${item.timestamp}-${i}`}><span>{item.agent}</span> {item.result || item.reason}{item.simulated ? " · simulated" : ""}</p>)}</section>}
          <div className="home-footnote"><Sparkles size={14} /> {session.demo_mode ? "Demo mode · simulated scenes are labeled" : "Live assistance session"}<Link to="/app/assist"><AudioLines size={15} /> Guidance</Link></div>
        </>}
      </main>
    </div>
  );
}
