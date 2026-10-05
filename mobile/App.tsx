import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { enqueueSpeech, stopSpeechQueue } from './audioQueue';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.121.249.233:8000';
const DEMO_ORIGIN = { lat: 12.9716, lon: 77.5946 };
const DEMO_DESTINATION = { lat: 12.975, lon: 77.605 };

type Session = {
  session_id: string;
  user_preferences?: { voice_rate?: number };
  navigation_active?: boolean;
  navigation_status?: string;
  navigation_next_distance_m?: number | null;
  navigation_next_instruction?: number;
  route?: Route | null;
};
type Place = { place_id: string; name: string; context: string; lat: number; lon: number };
type Route = { route_id: string; status: string; distance_m: number | null; duration_s: number | null; is_simulated: boolean; error?: string | null; geometry: number[][]; instructions: Array<{ instruction: string; distance_m: number; maneuver_type?: string | null; maneuver_modifier?: string | null }> };

function ActionButton({ title, onPress, secondary = false, disabled = false, accessibilityHint }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; accessibilityHint?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}>
    {disabled ? <ActivityIndicator color={secondary ? '#1948bd' : '#fff'} /> : <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>}
  </Pressable>;
}

export default function App() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [session, setSession] = useState<Session | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [navPaused, setNavPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [preview, setPreview] = useState<Route | null>(null);
  const [status, setStatus] = useState('Start assistance to begin.');
  const [lastSummary, setLastSummary] = useState('No scene described yet.');
  const camera = useRef<CameraView>(null);
  const searchInput = useRef<TextInput>(null);
  const sessionRef = useRef<Session | null>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const frameBusy = useRef(false);
  const demoPositionIndex = useRef(0);
  const gpsWarningAt = useRef(0);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`).then((response) => response.ok ? response.json() : Promise.reject())
      .then(() => { setApiReady(true); setStatus('VisionMate is ready.'); })
      .catch(() => { setApiReady(false); setStatus(`Backend unavailable at ${API_BASE}`); });
    return () => { locationSub.current?.remove(); stopSpeechQueue(); };
  }, []);

  useEffect(() => {
    if (!session) return;
    const socket = new WebSocket(`${API_BASE.replace(/^http/, 'ws')}/ws/session/${session.session_id}`);
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event.type === 'audio_event' && event.payload?.text) {
          enqueueSpeech(event.payload, session.user_preferences?.voice_rate ?? 1);
          setLastSummary(event.payload.text);
        } else if (event.type === 'session' && event.payload) {
          const next = event.payload as Session;
          if (next.route?.is_simulated && sessionRef.current?.route?.route_id !== next.route.route_id) demoPositionIndex.current = 0;
          sessionRef.current = { ...sessionRef.current, ...next } as Session;
          setSession((current) => current ? { ...current, ...next } : current);
          setNavPaused(next.navigation_status === 'paused');
        }
      } catch { /* Ignore malformed or unrelated events. */ }
    };
    return () => socket.close();
  }, [session?.session_id]);

  const startSession = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/session/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: 'Choose a destination', demo_mode: false }),
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const started = await response.json();
      const next: Session = { session_id: started.session_id };
      sessionRef.current = next;
      setSession(next);
      setStatus('Assistance session active. Choose where you want to go.');
      enqueueSpeech({ text: 'Assistance started. Where do you want to go?', priority: 3, expires_after_ms: 12000, deduplication_key: `session-start:${started.session_id}` });
    } catch {
      Alert.alert('Can’t reach VisionMate', `Check that the backend is running and listening on your Wi-Fi address.\n\n${API_BASE}`);
    } finally { setBusy(false); }
  };

  const searchPlaces = async () => {
    if (!session || searchText.trim().length < 2) {
      Alert.alert('Enter a destination', 'Type at least two characters, then choose Search.');
      return;
    }
    setSearching(true);
    setPlaces([]);
    try {
      const response = await fetch(`${API_BASE}/api/places/search?q=${encodeURIComponent(searchText.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Place search failed (${response.status})`);
      const results = (data.places || []) as Place[];
      setPlaces(results);
      if (!results.length) enqueueSpeech({ text: 'No matching destinations found. Try a nearby landmark or full address.', priority: 3, expires_after_ms: 12000, deduplication_key: `no-place:${searchText.trim().toLowerCase()}` });
      else enqueueSpeech({ text: `I found ${results.length} options. Choose your destination from the list.`, priority: 3, expires_after_ms: 12000, deduplication_key: `places:${searchText.trim().toLowerCase()}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      enqueueSpeech({ text: `Destination search failed. ${message}`, priority: 2, expires_after_ms: 15000, deduplication_key: `search-error:${message}` });
      Alert.alert('Search unavailable', message);
    } finally { setSearching(false); }
  };

  const previewDestination = async (place: Place, simulated = false) => {
    if (!session) return;
    setBusy(true);
    setSelectedPlace(place);
    setPreview(null);
    try {
      let origin: { latitude: number; longitude: number; accuracy: number };
      if (simulated) {
        origin = { latitude: DEMO_ORIGIN.lat, longitude: DEMO_ORIGIN.lon, accuracy: 5 };
      } else {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Location permission is needed to calculate a route from your current position. You can use the clearly labeled demo route instead.');
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (fix.coords.accuracy == null || fix.coords.accuracy > 50) throw new Error(`GPS accuracy is about ${Math.round(fix.coords.accuracy ?? 999)} metres. Wait for a more accurate fix and try again.`);
        origin = { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracy: fix.coords.accuracy };
      }
      await fetch(`${API_BASE}/api/location`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.session_id, location: {
          lat: origin.latitude, lon: origin.longitude, accuracy_m: origin.accuracy,
          timestamp: new Date().toISOString(), simulated,
        } }),
      });
      const response = await fetch(`${API_BASE}/api/navigation/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.session_id, destination: place.name, dest_lat: place.lat, dest_lon: place.lon,
          origin_lat: origin.latitude, origin_lon: origin.longitude, origin_accuracy_m: origin.accuracy,
          simulated,
        }),
      });
      const route = await response.json();
      if (!response.ok) throw new Error(route.detail || `Could not calculate route (${response.status})`);
      setPreview(route as Route);
      const km = ((route.distance_m ?? 0) / 1000).toFixed(1);
      const minutes = route.duration_s == null ? '' : ` Walking time is about ${Math.max(1, Math.round(route.duration_s / 60))} minutes.`;
      const phrase = `Destination selected: ${place.name}. The ${simulated ? 'simulated ' : ''}walking route is approximately ${km} kilometres.${minutes} Would you like to start navigation?`;
      setStatus(simulated ? 'Demo route ready. This route and origin are simulated.' : 'Route ready. Review the spoken summary and confirm to start.');
      enqueueSpeech({ text: phrase, priority: 3, expires_after_ms: 30000, deduplication_key: `preview:${session.session_id}:${place.place_id}` });
    } catch (error) {
      setPreview(null);
      const message = error instanceof Error ? error.message : 'Check the location and routing service, then try again.';
      enqueueSpeech({ text: message, priority: 2, expires_after_ms: 20000, deduplication_key: `route-preview-error:${message}` });
      Alert.alert('Route not ready', message);
    } finally { setBusy(false); }
  };

  const beginLocationTracking = async () => {
    locationSub.current?.remove();
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 2500 },
      async (fix) => {
        const current = sessionRef.current;
        if (!current?.navigation_active) return;
        if (fix.coords.accuracy == null || fix.coords.accuracy > 50) {
          setStatus('GPS accuracy is poor. Turn prompts are paused while the phone looks for a better fix.');
          if (Date.now() - gpsWarningAt.current > 20000) {
            gpsWarningAt.current = Date.now();
            enqueueSpeech({ text: 'GPS accuracy is currently poor. Turn guidance is paused until the location improves.', priority: 2, expires_after_ms: 12000, deduplication_key: `poor-gps:${current.session_id}:${gpsWarningAt.current}` });
          }
          return;
        }
        try {
          await fetch(`${API_BASE}/api/location`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: current.session_id, location: {
              lat: fix.coords.latitude, lon: fix.coords.longitude,
              accuracy_m: fix.coords.accuracy ?? undefined, heading: fix.coords.heading ?? undefined,
              timestamp: new Date(fix.timestamp).toISOString(), simulated: false,
            } }),
          });
        } catch { setStatus('Location update could not reach the backend.'); }
      },
      (error) => {
        setStatus(`Location unavailable: ${error}`);
        enqueueSpeech({ text: 'Location updates are unavailable. Navigation guidance is paused.', priority: 2, expires_after_ms: 15000, deduplication_key: `gps-unavailable:${sessionRef.current?.session_id}` });
      },
    );
  };

  const startNavigation = async () => {
    if (!session || !preview) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/navigation/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.session_id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Navigation could not start.');
      const next = { ...session, navigation_active: true, navigation_status: 'active', route: data.route };
      sessionRef.current = next; setSession(next); setPreview(null); setNavPaused(false);
      setStatus('Navigation active. Camera assistance can run at the same time.');
      demoPositionIndex.current = 0;
      if (!data.route.is_simulated) await beginLocationTracking();
    } catch (error) { Alert.alert('Navigation could not start', error instanceof Error ? error.message : 'Try again.'); }
    finally { setBusy(false); }
  };

  const controlNavigation = async (action: 'pause' | 'resume' | 'stop') => {
    if (!session) return;
    if (action === 'pause' || action === 'stop') { locationSub.current?.remove(); locationSub.current = null; }
    try {
      const response = await fetch(`${API_BASE}/api/navigation/control`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.session_id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Navigation action failed.');
      const active = action === 'resume';
      const next = { ...session, navigation_active: active, navigation_status: data.navigation_status };
      sessionRef.current = next; setSession(next); setNavPaused(action === 'pause');
      if (active && !session.route?.is_simulated) await beginLocationTracking();
      if (action === 'stop') setStatus('Navigation stopped. Assistance session is still active.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again.';
      enqueueSpeech({ text: message, priority: 2, expires_after_ms: 15000, deduplication_key: `navigation-control-error:${message}` });
      Alert.alert('Navigation action failed', message);
    }
  };

  const advanceDemo = async () => {
    const route = session?.route;
    if (!session || !route?.is_simulated || route.geometry.length < 2) return;
    const index = demoPositionIndex.current++;
    let lon: number, lat: number;
    if (index < 4) {
      const [startLon, startLat] = route.geometry[0];
      const [turnLon, turnLat] = route.geometry[1];
      const dx = (turnLon - startLon) * 111_320 * Math.cos(startLat * Math.PI / 180);
      const dy = (turnLat - startLat) * 111_320;
      const length = Math.hypot(dx, dy);
      const remaining = [450, 180, 40, 0][index];
      const t = Math.max(0, Math.min(1, (length - remaining) / length));
      lon = startLon + (turnLon - startLon) * t;
      lat = startLat + (turnLat - startLat) * t;
    } else {
      [lon, lat] = route.geometry[route.geometry.length - 1];
    }
    try {
      await fetch(`${API_BASE}/api/location`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.session_id, location: {
          lat, lon, accuracy_m: 5, timestamp: new Date().toISOString(), simulated: true,
        } }),
      });
      setStatus('Simulated GPS step sent. Demo guidance only.');
    } catch { setStatus('Could not send the simulated GPS step.'); }
  };

  const simulateDeviation = async () => {
    const route = session?.route;
    if (!session || !route?.is_simulated || !route.geometry.length) return;
    const [lon, lat] = route.geometry[0];
    for (let i = 0; i < 3; i++) {
      await fetch(`${API_BASE}/api/location`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.session_id, location: {
          lat: lat + 0.003 + i * 0.00001, lon: lon - 0.002, accuracy_m: 5,
          timestamp: new Date().toISOString(), simulated: true,
        } }),
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    setStatus('Simulated route deviation sent. VisionMate requested a new demo route.');
  };

  const simulatePedestrian = async () => {
    if (!session) return;
    for (let i = 0; i < 2; i++) {
      await fetch(`${API_BASE}/api/demo/scene`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.session_id, scene: 'pedestrian' }),
      });
    }
    setStatus('Simulated pedestrian detection sent alongside route guidance.');
  };

  const toggleCamera = async () => {
    if (!session) { Alert.alert('Start assistance first'); return; }
    if (cameraOn) { setCameraOn(false); setStatus('Camera paused. Navigation can continue.'); return; }
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) { Alert.alert('Camera permission needed', 'Allow camera access in system settings to describe your surroundings.'); return; }
    }
    setCameraOn(true);
    setStatus('Camera active. Looking for sustained detections.');
  };

  useEffect(() => {
    if (!cameraOn || !session) return;
    const timer = setInterval(async () => {
      if (frameBusy.current || !camera.current || !sessionRef.current) return;
      frameBusy.current = true;
      let originalUri: string | undefined;
      let resizedUri: string | undefined;
      try {
        const picture = await camera.current.takePictureAsync({ quality: 0.75, skipProcessing: true });
        if (!picture?.uri || !picture.width || !picture.height) return;
        originalUri = picture.uri;
        const scale = Math.min(1, 960 / Math.max(picture.width, picture.height));
        const resized = await ImageManipulator.manipulateAsync(
          picture.uri,
          [{ resize: { width: Math.round(picture.width * scale), height: Math.round(picture.height * scale) } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        resizedUri = resized.uri;
        if (!resized.base64) return;
        const response = await fetch(`${API_BASE}/api/observation`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionRef.current.session_id, image_base64: resized.base64 }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          setStatus(response.status === 429 ? 'Camera is catching up; skipping this frame.' : `Camera frame rejected: ${error.detail || `HTTP ${response.status}`}`);
        }
      } catch { setStatus('Camera frame could not be analyzed. Check the camera and network.'); }
      finally {
        if (resizedUri && resizedUri !== originalUri) void FileSystem.deleteAsync(resizedUri, { idempotent: true }).catch(() => undefined);
        if (originalUri) void FileSystem.deleteAsync(originalUri, { idempotent: true }).catch(() => undefined);
        frameBusy.current = false;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [cameraOn, session?.session_id]);

  const stopSession = async () => {
    const current = sessionRef.current;
    setCameraOn(false);
    locationSub.current?.remove(); locationSub.current = null;
    if (current) {
      try {
        await fetch(`${API_BASE}/api/navigation/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: current.session_id, action: 'stop' }) });
        await fetch(`${API_BASE}/api/session/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: current.session_id }) });
      } catch { /* Local stop still works. */ }
    }
    sessionRef.current = null; setSession(null); setPreview(null); setStatus('Assistance session stopped.'); stopSpeechQueue();
  };

  const nextInstruction = session?.route?.instructions?.[session.navigation_next_instruction ?? 0];
  const repeatInstruction = () => {
    if (!nextInstruction) return;
    const distance = session?.navigation_next_distance_m;
    const text = distance == null ? nextInstruction.instruction : `In approximately ${distance} metres, ${nextInstruction.instruction}`;
    enqueueSpeech({ text, priority: 3, expires_after_ms: 15000, deduplication_key: `repeat:${Date.now()}` });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.logo}><Text style={styles.logoText}>V</Text></View>
        <View style={styles.brand}><Text style={styles.brandName}>VisionMate</Text><Text style={styles.subbrand}>Home Guidance</Text></View>
        <View style={[styles.livePill, apiReady ? styles.readyPill : styles.offPill]}><Text style={styles.liveText}>{apiReady ? 'LIVE' : 'OFFLINE'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Emergency help" style={styles.sos} onPress={() => Alert.alert('Need immediate help?', 'Use your phone’s emergency call feature or contact someone you trust.')}><Text style={styles.sosText}>SOS</Text></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.statusCard}><View style={[styles.dot, apiReady && styles.dotReady]} /><Text accessibilityLiveRegion="polite" style={styles.statusText}>{status}</Text></View>
        <Text style={styles.title}>Hello! I’m ready to help.</Text>
        <Text style={styles.body}>Choose a destination and confirm the route before navigation starts. Camera assistance can run alongside it.</Text>
        <ActionButton title={busy ? 'Working…' : session ? '■  End assistance session' : '◎  Start assistance'} onPress={() => session ? void stopSession() : void startSession()} disabled={busy} />

        {session && !session.navigation_active && session.navigation_status !== 'paused' && !preview && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Choose a destination</Text>
          <TextInput
            ref={searchInput} value={searchText} onChangeText={setSearchText} onSubmitEditing={() => void searchPlaces()}
            returnKeyType="search" accessibilityLabel="Destination search" accessibilityHint="Type a place, address, or landmark. You can use your keyboard’s voice dictation if available. Search is sent only when you press Search."
            placeholder="Where do you want to go?" placeholderTextColor="#77819a" style={styles.input}
          />
          <ActionButton secondary title="Use keyboard voice dictation" onPress={() => searchInput.current?.focus()} accessibilityHint="Focuses destination entry. Tap the microphone on your phone keyboard to dictate if available." />
          <ActionButton title={searching ? 'Searching…' : 'Search destination'} onPress={() => void searchPlaces()} disabled={searching || searchText.trim().length < 2} accessibilityHint="Searches OpenStreetMap when you press this button; it does not autocomplete as you type." />
          <Text style={styles.attribution}>Place search © OpenStreetMap contributors</Text>
          {places.map((place) => <Pressable key={place.place_id} accessibilityRole="button" accessibilityLabel={`${place.name}, ${place.context}`} style={styles.place} onPress={() => { setSelectedPlace(place); void previewDestination(place); }}>
            <Text style={styles.placeName}>{place.name}</Text><Text style={styles.placeContext}>{place.context}</Text>
          </Pressable>)}
          <View style={styles.divider} />
          <Text style={styles.demoNote}>Offline demo uses a simulated Bengaluru origin and route.</Text>
          <ActionButton secondary title="Preview simulated demo route" onPress={() => void previewDestination({ place_id: 'demo-destination', name: 'Demo destination', context: 'Simulated route', lat: DEMO_DESTINATION.lat, lon: DEMO_DESTINATION.lon }, true)} disabled={busy} />
        </View>}

        {preview && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Confirm destination</Text>
          <Text style={styles.placeName}>{selectedPlace?.name}</Text>
          {selectedPlace?.context ? <Text style={styles.placeContext}>{selectedPlace.context}</Text> : null}
          <Text accessibilityLiveRegion="polite" style={styles.routeSummary}>
            {preview.is_simulated ? 'SIMULATED · ' : ''}Walking route approximately {((preview.distance_m ?? 0) / 1000).toFixed(1)} km
            {preview.duration_s == null ? '' : ` · about ${Math.max(1, Math.round(preview.duration_s / 60))} min`}
          </Text>
          <Text style={styles.safetyNote}>Mapped route only; this does not confirm that paths, entrances, or crossings are clear or accessible.</Text>
          <ActionButton title="Start navigation" onPress={() => void startNavigation()} disabled={busy} />
          <ActionButton secondary title="Cancel route" onPress={() => { setPreview(null); setSelectedPlace(null); setStatus('Route cancelled. Choose a destination when ready.'); }} />
        </View>}

        {session && (session.navigation_active || session.navigation_status === 'paused' || session.navigation_status === 'arrived') && <View style={styles.card}>
          <Text style={styles.sectionTitle}>{session.navigation_status === 'recalculating' ? 'Updating route…' : session.navigation_status === 'arrived' ? 'Destination area reached' : navPaused ? 'Navigation paused' : 'Navigation active'}</Text>
          <Text style={styles.placeName}>{selectedPlace?.name ?? session.route?.status ?? 'Selected destination'}</Text>
          <Text style={styles.routeSummary}>{session.navigation_next_distance_m == null ? 'Following mapped route' : `Next mapped turn in approximately ${session.navigation_next_distance_m} m`}</Text>
          <Text style={styles.nextInstruction}>{nextInstruction?.instruction ?? 'Continue along the mapped route. Check your surroundings.'}</Text>
          {session.route?.is_simulated && session.navigation_active && <ActionButton secondary title="Simulate next GPS step" onPress={() => void advanceDemo()} accessibilityHint="Moves the demo location along a simulated route. No real location is used." />}
          {session.route?.is_simulated && session.navigation_active && <ActionButton secondary title="Simulate route deviation" onPress={() => void simulateDeviation()} accessibilityHint="Sends three labeled simulated off-route fixes to demonstrate route recalculation." />}
          {session.route?.is_simulated && <ActionButton secondary title="Simulate pedestrian detection" onPress={() => void simulatePedestrian()} accessibilityHint="Sends labeled demo detections while navigation continues." />}
          {session.navigation_status !== 'arrived' && <ActionButton secondary title="Repeat instruction" onPress={repeatInstruction} />}
          {session.navigation_status !== 'arrived' && <ActionButton secondary title={navPaused ? 'Resume navigation' : 'Pause navigation'} onPress={() => void controlNavigation(navPaused ? 'resume' : 'pause')} />}
          {session.navigation_status !== 'arrived' && <ActionButton title="Stop navigation" onPress={() => void controlNavigation('stop')} />}
        </View>}

        {session && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <Text style={styles.body}>Camera and route guidance run independently.</Text>
          <ActionButton secondary title={cameraOn ? 'Pause camera' : 'Describe surroundings'} onPress={() => void toggleCamera()} />
          {cameraOn && <View style={styles.cameraBox}><CameraView ref={camera} style={styles.camera} facing="back" /></View>}
          <Text style={styles.sceneHeading}>Latest guidance</Text><Text style={styles.sceneText}>{lastSummary}</Text>
        </View>}
        <Text style={styles.disclaimer}>Prototype guidance only. It does not verify that a path or crossing is safe.</Text>
      </ScrollView>
      <View style={styles.tabs}><Text style={styles.tabActive}>⌂  Home</Text><Text style={styles.tab}>▣  Scan</Text><Text style={styles.tab}>◖  Audio</Text><Text style={styles.tab}>☷  Settings</Text></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f8ff' },
  header: { height: 66, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#e4e9fb', gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#3158df', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '900', fontSize: 18 }, brand: { flex: 1 }, brandName: { color: '#14244e', fontWeight: '900', fontSize: 17 }, subbrand: { color: '#667599', fontSize: 11, fontWeight: '600' },
  livePill: { borderRadius: 14, paddingVertical: 6, paddingHorizontal: 9 }, readyPill: { backgroundColor: '#d9f8e8' }, offPill: { backgroundColor: '#eceef5' }, liveText: { color: '#17754c', fontSize: 10, fontWeight: '900' },
  sos: { backgroundColor: '#d9232e', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }, sosText: { color: '#fff', fontWeight: '900' },
  content: { padding: 18, paddingBottom: 30 }, statusCard: { backgroundColor: '#e9edff', borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 20 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#ef9a20' }, dotReady: { backgroundColor: '#18b875' }, statusText: { color: '#27385f', fontSize: 13, fontWeight: '700', flex: 1 },
  title: { color: '#17264f', fontSize: 23, fontWeight: '900' }, body: { color: '#657292', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 14 }, button: { minHeight: 54, borderRadius: 15, backgroundColor: '#073cb7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 9 }, buttonText: { color: '#fff', fontSize: 15, textAlign: 'center', fontWeight: '900' }, secondaryButton: { backgroundColor: '#e8edff', borderWidth: 1, borderColor: '#d8e0fb' }, secondaryText: { color: '#1744ac' }, disabledButton: { opacity: .5 },
  card: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#e7eaf5', padding: 16, marginTop: 16, elevation: 2 }, sectionTitle: { color: '#17264f', fontSize: 18, fontWeight: '900', marginBottom: 9 }, input: { height: 54, borderWidth: 1, borderColor: '#cbd4ef', borderRadius: 13, paddingHorizontal: 14, color: '#14244e', fontSize: 16, marginTop: 6 }, attribution: { color: '#77819a', fontSize: 11, textAlign: 'center', marginTop: 9 }, place: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#edf0f8' }, placeName: { color: '#162750', fontSize: 16, fontWeight: '800' }, placeContext: { color: '#6d7894', fontSize: 13, marginTop: 3 }, demoNote: { color: '#667599', fontSize: 13, lineHeight: 19, marginTop: 4 }, divider: { height: 1, backgroundColor: '#edf0f8', marginVertical: 14 }, routeSummary: { color: '#173caa', fontSize: 15, fontWeight: '800', lineHeight: 22, marginTop: 9 }, safetyNote: { color: '#68748e', fontSize: 12, lineHeight: 18, marginTop: 8 }, nextInstruction: { color: '#173caa', backgroundColor: '#f0f3ff', padding: 14, borderRadius: 13, fontSize: 16, fontWeight: '800', lineHeight: 23, marginTop: 10 },
  sceneHeading: { color: '#173caa', fontWeight: '900', fontSize: 15, marginTop: 15 }, sceneText: { color: '#304064', marginTop: 7, fontSize: 14, lineHeight: 21 }, cameraBox: { height: 270, borderRadius: 16, overflow: 'hidden', marginTop: 13, backgroundColor: '#1c2540' }, camera: { flex: 1 }, disclaimer: { textAlign: 'center', color: '#7c879e', fontSize: 11, lineHeight: 16, marginTop: 16 },
  tabs: { height: 58, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e4e8f5', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }, tabActive: { color: '#1749c8', fontSize: 12, fontWeight: '900' }, tab: { color: '#77819a', fontSize: 12, fontWeight: '700' },
});
