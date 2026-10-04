import { Mic } from "lucide-react";
import { useSession } from "../context/SessionContext";
import { listenOnce } from "../services/voice";
import { speak } from "../services/voice";
import { BigButton, Card } from "./ui";

export function Controls() {
  const { session, start, stop, pause, resume, sendCommand } = useSession();
  async function voice() {
    try {
      const said = await listenOnce();
      await sendCommand(said);
    } catch (err) {
      speak("Voice commands are not available in this browser.", session?.user_preferences.voice_rate || 1, true);
      console.warn(err);
    }
  }
  return (
    <Card title="Main controls">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <BigButton onClick={() => void start(session?.destination || "Demo destination", session?.demo_mode ?? true)} disabled={!!session && session.session_status !== "stopped"}>
          Start assistance
        </BigButton>
        <BigButton tone="warn" onClick={() => void pause()} disabled={!session || session.session_status === "paused"}>
          Pause
        </BigButton>
        <BigButton tone="neutral" onClick={() => void resume()} disabled={session?.session_status !== "paused"}>
          Resume
        </BigButton>
        <BigButton tone="danger" onClick={() => void stop()} disabled={!session || session.session_status === "stopped"}>
          Stop session
        </BigButton>
        <BigButton tone="neutral" onClick={() => void sendCommand("describe surroundings")}>
          Describe surroundings
        </BigButton>
        <BigButton
          tone="neutral"
          onClick={() => session?.last_alert && speak(session.last_alert.text, session.user_preferences.voice_rate, true)}
        >
          Repeat last instruction
        </BigButton>
        <BigButton tone="neutral" onClick={() => void voice()}>
          <span className="inline-flex items-center gap-2">
            <Mic size={18} /> Voice command
          </span>
        </BigButton>
      </div>
    </Card>
  );
}
