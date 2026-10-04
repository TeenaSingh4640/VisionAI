import { useEffect, useState } from "react";
import { AudioLines, CheckCircle2, Contrast, Mic, Moon, Sun, Volume2, Vibrate } from "lucide-react";
import { Header } from "../components/Header";
import { useSession } from "../context/SessionContext";
import { speak } from "../services/voice";

type ComfortPrefs = { textSize: "standard" | "large" | "largest"; theme: "standard" | "dark" | "black"; contrast: "standard" | "high"; haptics: boolean; reducedMotion: boolean };
const DEFAULT_COMFORT: ComfortPrefs = { textSize: "standard", theme: "standard", contrast: "standard", haptics: true, reducedMotion: true };

function readComfort(): ComfortPrefs {
  try { return { ...DEFAULT_COMFORT, ...JSON.parse(localStorage.getItem("visionmate-comfort") || "{}") }; }
  catch { return DEFAULT_COMFORT; }
}

export default function SettingsPage() {
  const { session, health, updatePrefs, developerMode, setDeveloperMode, cameraSource, setCameraSource, start } = useSession();
  const prefs = session?.user_preferences;
  const [comfort, setComfort] = useState<ComfortPrefs>(readComfort);
  useEffect(() => {
    document.documentElement.dataset.text = comfort.textSize;
    document.documentElement.dataset.theme = comfort.theme;
    document.documentElement.dataset.contrast = comfort.contrast;
    document.documentElement.dataset.reduceMotion = String(comfort.reducedMotion);
    localStorage.setItem("visionmate-comfort", JSON.stringify(comfort));
  }, [comfort]);
  const changeComfort = <K extends keyof ComfortPrefs>(key: K, value: ComfortPrefs[K]) => setComfort((old) => ({ ...old, [key]: value }));

  return (
    <div className="screen">
      <Header />
      <main className="app-main settings-main">
        <section className="settings-intro"><div className="settings-avatar"><Mic size={21} /></div><div><h1>Sensory Comfort Profile</h1><p>Make VisionMate more comfortable to use.</p></div></section>

        <section className="settings-group">
          <h2><Volume2 size={17} /> 1. Voice & Audio</h2>
          <div className="settings-card">
            <label className="setting-label" htmlFor="voice-speed">Voice Reading Speed</label><p className="setting-help">Adjust how fast assistant prompts and alerts are spoken aloud.</p>
            <div className="speed-choices">{[{ value: 0.75, label: "0.75x", sub: "Calm" }, { value: 1, label: "Standard", sub: "1.0x" }, { value: 1.25, label: "1.25x", sub: "Fast" }].map((speed) => <button key={speed.value} className={prefs?.voice_rate === speed.value ? "selected" : ""} onClick={() => void updatePrefs({ voice_rate: speed.value })} disabled={!session}><strong>{speed.label}</strong><small>{speed.sub}</small>{prefs?.voice_rate === speed.value && <CheckCircle2 size={14} />}</button>)}</div>
            <input id="voice-speed" className="sr-only" type="range" min={0.7} max={1.4} step={0.05} value={prefs?.voice_rate ?? 1} onChange={(event) => void updatePrefs({ voice_rate: Number(event.target.value) })} disabled={!session} aria-label="Voice speed" />
            <button className="setting-test" onClick={() => speak("VisionMate sound test. Voice guidance is enabled.", prefs?.voice_rate ?? 1, true)}><AudioLines size={16} /> Test voice</button>
          </div>
          <div className="settings-card">
            <label className="setting-label">Instruction Detail Level</label><p className="setting-help">Choose concise guidance or richer context.</p>
            <div className="detail-choices">{[{ id: "minimal", title: "Concise Guidance", body: "Direct turns, obstacle countdowns, minimal chatter" }, { id: "detailed", title: "Detailed Descriptions", body: "Surface textures, lighting changes, surroundings" }].map((choice) => <button key={choice.id} className={prefs?.verbosity === choice.id ? "selected" : ""} onClick={() => void updatePrefs({ verbosity: choice.id as "minimal" | "detailed" })} disabled={!session}><span className="choice-radio" /> <span><strong>{choice.title}</strong><small>{choice.body}</small></span>{prefs?.verbosity === choice.id && <CheckCircle2 size={15} />}</button>)}</div>
          </div>
          <ToggleRow icon={<Vibrate size={17} />} title="Vibration Feedback (Haptics)" description="Vibration is available where this device supports it." checked={comfort.haptics} onChange={(value) => changeComfort("haptics", value)} />
        </section>

        <section className="settings-group">
          <h2><Contrast size={17} /> 2. Appearance & Legibility</h2>
          <div className="settings-card"><label className="setting-label">Screen Font Size</label><p className="setting-help">Applies a larger, clearer type scale across the app.</p><div className="segmented-control">{([{ id: "standard", label: "100%" }, { id: "large", label: "150%" }, { id: "largest", label: "200%" }] as const).map((item) => <button key={item.id} className={comfort.textSize === item.id ? "selected" : ""} onClick={() => changeComfort("textSize", item.id)}>{item.label}</button>)}</div></div>
          <div className="settings-card"><label className="setting-label">Display Theme & Palette</label><p className="setting-help">Choose a contrast theme that feels clear to you.</p><div className="theme-choices">{[{ id: "standard", label: "Standard", Icon: Sun }, { id: "dark", label: "Dark", Icon: Moon }, { id: "black", label: "Max Black", Icon: Contrast }].map(({ id, label, Icon }) => <button key={id} className={comfort.theme === id ? "selected" : ""} onClick={() => changeComfort("theme", id as ComfortPrefs["theme"])}><Icon size={16} /><span>{label}</span></button>)}</div></div>
          <ToggleRow icon={<AudioLines size={17} />} title="Reduce Motion & Animations" description="Use calmer transitions and fewer animated effects." checked={comfort.reducedMotion} onChange={(value) => changeComfort("reducedMotion", value)} />
        </section>

        <section className="settings-group">
          <h2><Mic size={17} /> 3. Input & Interaction</h2>
          <div className="settings-card"><label className="setting-label" htmlFor="camera-source">Camera device ID (optional)</label><p className="setting-help">Leave blank to use the default environment camera.</p><input id="camera-source" className="setting-input" value={cameraSource} onChange={(event) => setCameraSource(event.target.value)} placeholder="Default camera" /></div>
          <ToggleRow title="Demo Mode" description="Controlled scenes and simulated route responses." checked={prefs?.demo_mode ?? true} disabled={!session} onChange={(value) => void updatePrefs({ demo_mode: value })} />
          <ToggleRow title="Developer Mode" description="Show object tracking IDs on camera overlays." checked={developerMode} onChange={setDeveloperMode} />
          <ToggleRow title="Scene Descriptions" description="Enable optional scene summaries when available." checked={prefs?.scene_descriptions ?? false} disabled={!session} onChange={(value) => void updatePrefs({ scene_descriptions: value })} />
        </section>

        <section className="settings-group"><h2>Privacy & Session</h2><div className="settings-card"><p className="setting-help">Raw camera frames are not stored by default. Sampled frames are sent to your local VisionMate backend for detection.</p><p className="perception-info">Current detector: <strong>{health?.perception_model || health?.perception || "Backend unavailable"}</strong>{health?.inference_max_side ? ` · ${health.inference_max_side}px input` : ""}</p><button className="setting-test" onClick={() => void start("Demo destination", true)}>Start a new demo session</button></div></section>
        <p className="safety-footnote">VisionMate is an experimental prototype. It does not guarantee a route is safe or accessible.</p>
      </main>
    </div>
  );
}

function ToggleRow({ icon, title, description, checked, onChange, disabled = false }: { icon?: React.ReactNode; title: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className="toggle-row"><span className="toggle-icon">{icon}</span><span className="toggle-copy"><strong>{title}</strong><small>{description}</small></span><button type="button" className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={() => onChange(!checked)}><span /></button></div>;
}
