import { Header } from "../components/Header";
import { useSession } from "../context/SessionContext";
import { speak } from "../services/voice";
import { BigButton, Card } from "../components/ui";

export default function SettingsPage() {
  const { session, updatePrefs, developerMode, setDeveloperMode, cameraSource, setCameraSource, start } = useSession();
  const prefs = session?.user_preferences;
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <h1 className="font-display text-2xl">Settings</h1>
        <Card title="Voice and alerts">
          <label className="block text-sm">
            Voice speed: {prefs?.voice_rate ?? 1}
            <input
              className="mt-2 w-full"
              type="range"
              min={0.7}
              max={1.4}
              step={0.1}
              value={prefs?.voice_rate ?? 1}
              onChange={(e) => void updatePrefs({ voice_rate: Number(e.target.value) })}
              disabled={!session}
            />
          </label>
          <label className="mt-4 block text-sm">
            Alert verbosity
            <select
              className="mt-2 w-full rounded-xl bg-navy-800 p-3"
              value={prefs?.verbosity ?? "balanced"}
              onChange={(e) => void updatePrefs({ verbosity: e.target.value as "minimal" | "balanced" | "detailed" })}
              disabled={!session}
            >
              <option value="minimal">Minimal</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
          <label className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs?.scene_descriptions ?? false}
              onChange={(e) => void updatePrefs({ scene_descriptions: e.target.checked })}
              disabled={!session}
            />
            Enable optional scene descriptions
          </label>
          <div className="mt-3">
            <BigButton tone="neutral" onClick={() => speak("VisionMate sound test. Please pause if a hazard is announced.", prefs?.voice_rate ?? 1, true)}>
              Sound test
            </BigButton>
          </div>
        </Card>
        <Card title="Capture">
          <label className="block text-sm">
            Camera device ID (optional)
            <input
              className="mt-2 w-full rounded-xl bg-navy-800 p-3"
              value={cameraSource}
              onChange={(e) => setCameraSource(e.target.value)}
              placeholder="Leave blank for default / environment camera"
            />
          </label>
          <label className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs?.demo_mode ?? true}
              onChange={(e) => void updatePrefs({ demo_mode: e.target.checked })}
              disabled={!session}
            />
            Demo mode (simulated detections and mock routing)
          </label>
          <label className="mt-4 flex items-center gap-2">
            <input type="checkbox" checked={developerMode} onChange={(e) => setDeveloperMode(e.target.checked)} />
            Developer mode (show tracking IDs)
          </label>
        </Card>
        <Card title="Privacy">
          <p className="text-sm text-slate-300">
            Raw camera frames are not stored by default. Sampled frames are sent only to the local VisionMate backend for
            detection. Voice stays in the browser. Do not log personal coordinates in public demos.
          </p>
        </Card>
        <Card title="Session">
          <BigButton
            tone="neutral"
            onClick={() => void start("Demo destination", true)}
          >
            Reset / start a new demo session
          </BigButton>
        </Card>
      </main>
    </div>
  );
}
