import { useEffect, useRef, useState, type RefObject } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { api, sessionSocketUrl } from "./src/services/api";
import type { AudioEvent, HealthInfo, SessionState } from "./src/types";

type Screen = "home" | "live" | "settings";
type DemoScene = { id: string; label: string };

const scenes: DemoScene[] = [
  { id: "clear", label: "Normal navigation" },
  { id: "blocked", label: "Obstacle detection" },
  { id: "pedestrian", label: "Potential vehicle" },
  { id: "uncertain", label: "Uncertain perception" },
  { id: "obstacle_removed", label: "Camera recovery" },
];

declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };

const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.7:8005";
export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [session, setSession] = useState<SessionState | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [locationStatus, setLocationStatus] = useState("Not connected");
  const [latestAudio, setLatestAudio] = useState("No spoken update yet.");
  const cameraRef = useRef<CameraView>(null!);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setError(`Backend unavailable at ${apiUrl}`));
  }, []);

  useEffect(() => {
    if (!session?.session_id) return;
    const socket = new WebSocket(sessionSocketUrl(session.session_id));
    socketRef.current = socket;
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type: string; payload: SessionState | AudioEvent };
        if (message.type === "session") setSession(message.payload as SessionState);
        if (message.type === "audio_event") {
          const audio = message.payload as AudioEvent;
          setLatestAudio(audio.text);
          if (!muted) Speech.speak(audio.text, { rate: session.user_preferences.voice_rate || 1 });
        }
      } catch {
        setError("Received an invalid event from the VisionMate backend.");
      }
    };
    socket.onerror = () => setError("Live event connection lost. Status updates may be delayed.");
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [session?.session_id, muted]);

  useEffect(() => {
    if (!session?.session_id || session.session_status === "stopped") return;
    const timer = setInterval(() => {
      api.state(session.session_id).then(setSession).catch(() => setError("Could not refresh session status."));
    }, 3000);
    return () => clearInterval(timer);
  }, [session?.session_id, session?.session_status]);

  useEffect(() => {
    if (!session?.session_id || !cameraEnabled || !cameraPermission?.granted) return;
    const timer = setInterval(async () => {
      const picture = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.55, skipProcessing: true });
      if (picture?.base64) {
        try { await api.observation(session.session_id, picture.base64); }
        catch { setError("Camera frame could not be analyzed."); }
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [session?.session_id, cameraEnabled, cameraPermission?.granted]);

  async function start(demoMode: boolean) {
    try {
      setError("");
      const created = await api.startSession("Demo destination", demoMode);
      setSession(await api.state(created.session_id));
      setScreen("live");
      say("Assistance session started. I will describe possible hazards conservatively.");
    } catch { setError("Could not start the assistance session."); }
  }

  async function stop() {
    if (!session) return;
    await api.stopSession(session.session_id);
    setSession(await api.state(session.session_id));
    setCameraEnabled(false);
    Speech.stop();
    setScreen("home");
  }

  async function runDemo(scene: string, fail = false) {
    if (!session) {
      await start(true);
      return;
    }
    try {
      await api.demoScene(session.session_id, scene, fail);
      setSession(await api.state(session.session_id));
      setScreen("live");
    } catch { setError("The demonstration scenario could not be loaded."); }
  }

  async function enableLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setLocationStatus("Permission denied");
      return;
    }
    setLocationStatus("Receiving fix");
    if (!session) return;
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await api.location(session.session_id, {
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      accuracy_m: location.coords.accuracy || undefined,
      heading: location.coords.heading || undefined,
      timestamp: new Date(location.timestamp).toISOString(),
      simulated: false,
    });
  }

const lastSpokenRef = useRef<string>("");
const lastSpokenTimeRef = useRef<number>(0);

function say(text: string, force = false) {
  if (!text || (muted && !force)) return;
  const now = Date.now();
  const isDuplicate = text.trim().toLowerCase() === lastSpokenRef.current.trim().toLowerCase();
  const cooldownElapsed = now - lastSpokenTimeRef.current > 7000;

  if (!isDuplicate || cooldownElapsed || force) {
    lastSpokenRef.current = text;
    lastSpokenTimeRef.current = now;
    setLatestAudio(text);
    Speech.isSpeakingAsync().then((speaking: boolean) => {
      if (!speaking || force) {
        Speech.stop();
        Speech.speak(text, { rate: session?.user_preferences?.voice_rate || 1 });
      }
    });
  }
}

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandMark}><Ionicons name="eye-outline" size={24} color="#fff" /></View>
          <View><Text style={styles.brand}>VisionMate</Text><Text style={styles.subtitle}>Audio-first visual assistance</Text></View>
          <View style={styles.ready}><View style={styles.readyDot} /><Text style={styles.readyText}>{health?.ok ? "READY" : "OFFLINE"}</Text></View>
        </View>

        {error ? <Pressable accessibilityRole="alert" style={styles.error} onPress={() => setError("")}><Text style={styles.errorText}>{error}</Text></Pressable> : null}

        {screen === "home" && <Home onStart={() => start(false)} onDemo={() => start(true)} onSettings={() => setScreen("settings")} scenes={scenes} runDemo={runDemo} />}
        {screen === "live" && <Live session={session} latestAudio={latestAudio} muted={muted} onMute={setMuted} onStop={stop} onDemo={runDemo} onLocation={enableLocation} locationStatus={locationStatus} cameraPermission={cameraPermission} requestCameraPermission={requestCameraPermission} cameraEnabled={cameraEnabled} setCameraEnabled={setCameraEnabled} cameraRef={cameraRef} />}
        {screen === "settings" && <Settings muted={muted} onMute={setMuted} onBack={() => setScreen("home")} />}

        <View style={styles.nav}>
          <NavButton active={screen === "home"} icon="home-outline" label="Home" onPress={() => setScreen("home")} />
          <NavButton active={screen === "live"} icon="volume-high-outline" label="Live audio" onPress={() => setScreen(session ? "live" : "home")} />
          <NavButton active={screen === "settings"} icon="options-outline" label="Settings" onPress={() => setScreen("settings")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Home({ onStart, onDemo, onSettings, scenes, runDemo }: { onStart: () => void; onDemo: () => void; onSettings: () => void; scenes: DemoScene[]; runDemo: (scene: string, fail?: boolean) => Promise<void> }) {
  return <View>
    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="volume-high-outline" size={32} color="#fff" /></View><Text style={styles.eyebrow}>SEE · UNDERSTAND · NAVIGATE</Text><Text style={styles.heroTitle}>Calm, spoken support for moving through the world.</Text><Text style={styles.body}>VisionMate combines camera awareness, mapped route guidance, and conservative hazard alerts. You stay in control.</Text></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Ready when you are</Text><Text style={styles.body}>Try the real backend in demo mode without a camera, GPS, or speaker.</Text><Button title="Start navigation" icon="navigate-outline" onPress={onStart} primary /><Button title="Try demo mode" icon="sparkles-outline" onPress={onDemo} /></View>
    <View style={styles.featureRow}><StatusItem icon="camera-outline" label="Camera" value="Permission on demand" /><StatusItem icon="location-outline" label="GPS" value="Used for guidance" /><StatusItem icon="volume-high-outline" label="Voice" value="Priority alerts" /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Hackathon demonstration</Text><Text style={styles.body}>Scenarios are sent to the backend and marked simulated.</Text>{scenes.map((scene) => <Button key={scene.id} title={scene.label} onPress={() => void runDemo(scene.id)} />)}<Button title="Accessibility settings" icon="options-outline" onPress={onSettings} /></View>
    <Text style={styles.disclaimer}>Prototype only. It does not guarantee safe navigation or verify that a road or crossing is safe.</Text>
  </View>;
}

function Live(props: { session: SessionState | null; latestAudio: string; muted: boolean; onMute: (value: boolean) => void; onStop: () => void; onDemo: (scene: string, fail?: boolean) => Promise<void>; onLocation: () => Promise<void>; locationStatus: string; cameraPermission: { granted: boolean } | null; requestCameraPermission: () => Promise<unknown>; cameraEnabled: boolean; setCameraEnabled: (value: boolean) => void; cameraRef: RefObject<CameraView> }) {
  const { session, latestAudio, muted, onMute, onStop, onDemo, onLocation, locationStatus, cameraPermission, requestCameraPermission, cameraEnabled, setCameraEnabled, cameraRef } = props;
  const hazard = session?.active_hazards[0];
  return <View>
    <View style={styles.liveBanner}><View style={styles.readyDot} /><Text style={styles.liveText}>ASSISTANCE {session?.session_status?.replaceAll("_", " ").toUpperCase() || "READY"}</Text></View>
    <View style={styles.card}><Text style={styles.eyebrow}>LATEST SPOKEN UPDATE</Text><Text style={styles.instruction}>{latestAudio}</Text><Button title="Repeat update" icon="volume-high-outline" onPress={() => Speech.speak(latestAudio)} /></View>
    <View style={styles.featureRow}><StatusItem icon="camera-outline" label="Camera" value={cameraEnabled ? "Analyzing frames" : "Demo or paused"} /><StatusItem icon="location-outline" label="GPS" value={locationStatus} /><StatusItem icon="sparkles-outline" label="Agent" value={session?.current_agent_step || "Idle"} /></View>
    {hazard ? <View style={styles.hazard}><Ionicons name="warning-outline" size={23} color="#9a5a18" /><View style={{ flex: 1 }}><Text style={styles.hazardTitle}>{hazard.classification.replaceAll("_", " ")}</Text><Text style={styles.hazardBody}>{hazard.reasoning}</Text><Text style={styles.hazardMeta}>Uncertainty {Math.round(hazard.uncertainty * 100)}% · no movement command issued</Text></View></View> : <View style={styles.clear}><Ionicons name="checkmark-circle-outline" size={23} color="#23764f" /><Text style={styles.clearText}>No assessed hazard. Detection alone is not treated as danger.</Text></View>}
    <View style={styles.card}><Text style={styles.cardTitle}>Sensors</Text>{cameraPermission?.granted ? <Button title={cameraEnabled ? "Stop camera analysis" : "Start camera analysis"} icon="camera-outline" onPress={() => setCameraEnabled(!cameraEnabled)} /> : <Button title="Allow camera" icon="camera-outline" onPress={() => void requestCameraPermission()} />}{cameraEnabled && <CameraView ref={cameraRef} style={styles.camera} facing="back" />}{<Button title={`Location: ${locationStatus}`} icon="location-outline" onPress={() => void onLocation()} />}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Demo scenario</Text><Button title="Obstacle detection" onPress={() => void onDemo("blocked")} /><Button title="Uncertain perception" onPress={() => void onDemo("uncertain")} /><Button title="Route API failure" onPress={() => void onDemo("route_failure", true)} /></View>
    <View style={styles.rowBetween}><Text style={styles.body}>Mute routine announcements</Text><Switch value={muted} onValueChange={onMute} accessibilityLabel="Mute routine announcements" /></View>
    <Button title="Stop navigation" icon="stop-circle-outline" onPress={onStop} danger />
  </View>;
}

function Settings({ muted, onMute, onBack }: { muted: boolean; onMute: (value: boolean) => void; onBack: () => void }) {
  return <View><Text style={styles.heroTitle}>Accessibility settings</Text><Text style={styles.body}>Keep spoken feedback clear and under your control.</Text><View style={styles.card}><View style={styles.rowBetween}><Text style={styles.cardTitle}>Mute routine announcements</Text><Switch value={muted} onValueChange={onMute} /></View><Text style={styles.body}>Critical warnings may still be delivered by the backend priority system.</Text></View><Button title="Back to home" onPress={onBack} /></View>;
}

function StatusItem({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.statusItem}><Ionicons name={icon} size={20} color="#2453c5" /><Text style={styles.statusLabel}>{label}<Text style={styles.statusValue}>{"\n"}{value}</Text></Text></View>;
}
function Button({ title, onPress, icon, primary, danger }: { title: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; primary?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" style={[styles.button, primary && styles.primaryButton, danger && styles.dangerButton]} onPress={onPress}>{icon && <Ionicons name={icon} size={20} color={primary || danger ? "#fff" : "#2453c5"} />}<Text style={[styles.buttonText, (primary || danger) && styles.inverseText]}>{title}</Text></Pressable>;
}
function NavButton({ active, icon, label, onPress }: { active: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.navButton, active && styles.navActive]} onPress={onPress}><Ionicons name={icon} size={21} color={active ? "#2453c5" : "#61708a"} /><Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7fb" }, page: { flexGrow: 1, padding: 20, paddingTop: 22, paddingBottom: 35 }, header: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 24 }, brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#3159dc", alignItems: "center", justifyContent: "center" }, brand: { color: "#12213f", fontSize: 18, fontWeight: "800" }, subtitle: { color: "#61708a", fontSize: 11, marginTop: 2 }, ready: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }, readyDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: "#25b774" }, readyText: { color: "#16804e", fontSize: 10, fontWeight: "800" }, hero: { alignItems: "center", paddingVertical: 28 }, heroIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: "#3159dc", alignItems: "center", justifyContent: "center", marginBottom: 19 }, eyebrow: { color: "#2453c5", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, heroTitle: { color: "#12213f", fontSize: 32, lineHeight: 36, fontWeight: "800", letterSpacing: -1, marginTop: 10, marginBottom: 12 }, body: { color: "#61708a", fontSize: 13, lineHeight: 20 }, card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce4f0", borderRadius: 18, padding: 18, marginBottom: 14, shadowColor: "#142a53", shadowOpacity: .06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 }, cardTitle: { color: "#12213f", fontSize: 16, fontWeight: "800", marginBottom: 7 }, button: { minHeight: 48, borderWidth: 1, borderColor: "#dce4f0", borderRadius: 13, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, backgroundColor: "#fff" }, primaryButton: { backgroundColor: "#2453c5", borderColor: "#2453c5" }, dangerButton: { backgroundColor: "#a52d37", borderColor: "#a52d37" }, buttonText: { color: "#2453c5", fontSize: 14, fontWeight: "800" }, inverseText: { color: "#fff" }, featureRow: { flexDirection: "row", gap: 9, marginBottom: 14 }, statusItem: { flex: 1, minHeight: 76, borderWidth: 1, borderColor: "#dce4f0", borderRadius: 15, padding: 11, backgroundColor: "#fff" }, statusLabel: { color: "#61708a", fontSize: 10, marginTop: 8 }, statusValue: { color: "#12213f", fontSize: 11, fontWeight: "700" }, disclaimer: { color: "#61708a", fontSize: 11, lineHeight: 17, textAlign: "center", marginVertical: 10 }, error: { backgroundColor: "#fff0f0", borderWidth: 1, borderColor: "#e6baba", borderRadius: 12, padding: 12, marginBottom: 14 }, errorText: { color: "#982d2d", fontSize: 12, fontWeight: "700" }, liveBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }, liveText: { color: "#16804e", fontWeight: "800", fontSize: 11 }, instruction: { color: "#12213f", fontSize: 26, lineHeight: 31, fontWeight: "800", marginVertical: 15 }, hazard: { flexDirection: "row", gap: 12, padding: 16, borderRadius: 17, backgroundColor: "#fff7ec", borderWidth: 1, borderColor: "#f3d5ab", marginBottom: 14 }, hazardTitle: { color: "#8d4a16", fontSize: 14, fontWeight: "800", textTransform: "capitalize" }, hazardBody: { color: "#81511d", fontSize: 12, lineHeight: 17, marginTop: 4 }, hazardMeta: { color: "#9b6a31", fontSize: 10, marginTop: 5 }, clear: { flexDirection: "row", gap: 10, alignItems: "center", padding: 15, borderRadius: 15, backgroundColor: "#effaf4", borderWidth: 1, borderColor: "#c6ead5", marginBottom: 14 }, clearText: { color: "#21684b", flex: 1, fontSize: 12 }, camera: { height: 190, borderRadius: 14, overflow: "hidden", marginTop: 12 }, rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }, nav: { flexDirection: "row", backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce4f0", borderRadius: 18, padding: 7, marginTop: 8 }, navButton: { flex: 1, alignItems: "center", padding: 9, borderRadius: 12, gap: 3 }, navActive: { backgroundColor: "#e8efff" }, navLabel: { color: "#61708a", fontSize: 10, fontWeight: "700" }, navLabelActive: { color: "#2453c5" },
});
