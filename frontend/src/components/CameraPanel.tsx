import { useEffect, useRef, useState } from "react";
import { Camera, Circle, CircleStop, ShieldAlert } from "lucide-react";
import { useSession } from "../context/SessionContext";
import type { DetectedObject } from "../types";

export function CameraPanel() {
  const { session, submitFrame, cameraSource, setCameraSource, developerMode, start, updatePrefs } = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [camState, setCamState] = useState<"idle" | "requesting" | "live" | "error">("idle");
  const [camError, setCamError] = useState("");
  const [backendWarning, setBackendWarning] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const objects: DetectedObject[] = session?.latest_observation?.objects ?? [];

  useEffect(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objects.forEach((obj) => {
      const x = obj.bbox.x1 * canvas.width;
      const y = obj.bbox.y1 * canvas.height;
      const w = (obj.bbox.x2 - obj.bbox.x1) * canvas.width;
      const h = (obj.bbox.y2 - obj.bbox.y1) * canvas.height;
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
      const label = `${obj.class_name} ${Math.round(obj.confidence * 100)}%${developerMode && obj.track_id != null ? ` #${obj.track_id}` : ""}`;
      ctx.font = "bold 18px sans-serif";
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = "rgba(8,31,89,.92)";
      ctx.fillRect(x, Math.max(0, y - 27), tw, 27);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 6, Math.max(19, y - 8));
    });
  }, [objects, developerMode]);

  async function startCamera() {
    setCamState("requesting");
    setCamError("");
    let acquiredStream: MediaStream | undefined;
    let usedFallback = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(window.isSecureContext
          ? "This browser does not provide camera access. Try a current version of Chrome, Safari, or Firefox."
          : "Camera access requires HTTPS or localhost. Open VisionMate on a secure connection and try again.");
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: cameraSource ? { deviceId: { exact: cameraSource } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (firstError) {
        const errorName = (firstError as DOMException)?.name;
        if (cameraSource || errorName === "OverconstrainedError" || errorName === "NotFoundError") {
          // A requested device or rear-facing camera may not exist on this device. Retry with any available camera.
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          usedFallback = true;
        } else {
          throw firstError;
        }
      }
      acquiredStream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamState("live");
      setRunning(true);
      if (usedFallback) setCameraSource("");
      try { setCameras((await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput")); }
      catch { setCameras([]); }
      setBackendWarning("");
      try {
        // Tapping Start camera explicitly opts into sampled live frames for the active session.
        if (!session) await start("Demo destination", false);
        else if (session.demo_mode) await updatePrefs({ demo_mode: false });
      } catch {
        setBackendWarning("Camera preview is on, but the VisionMate backend could not start live analysis.");
      }
    } catch (error) {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      setCamState("error");
      const name = (error as DOMException)?.name;
      const customMessage = error instanceof Error && !(error instanceof DOMException) ? error.message : "";
      if (customMessage) setCamError(customMessage);
      else if (name === "NotAllowedError" || name === "PermissionDeniedError") setCamError("Camera permission is blocked. Open this page’s browser or site settings, set Camera to Allow, then tap Retry camera.");
      else if (name === "NotFoundError" || name === "DevicesNotFoundError") setCamError("No camera was found. Connect a camera or choose another device, then retry.");
      else if (name === "NotReadableError" || name === "TrackStartError") setCamError("The camera is busy or unavailable. Close other apps using it, then retry.");
      else if (name === "SecurityError") setCamError("Camera access requires HTTPS or localhost. Open VisionMate on a secure connection.");
      else if (name === "OverconstrainedError") setCamError("That camera is unavailable. Select another camera or use the default device.");
      else setCamError("The camera could not start. Check browser permission and device availability, then retry.");
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    setCamState("idle");
    if (timer.current) window.clearInterval(timer.current);
  }

  useEffect(() => {
    if (!running || !session?.session_id || session.demo_mode || session.session_status === "paused" || session.session_status === "stopped") {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        console.log("[Observation] frame captured");
        submitFrame(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        setBackendWarning("Live camera is on, but frame analysis failed. Check that the backend is connected.");
      }
    }, 450);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [running, session?.session_id, session?.demo_mode, session?.session_status, submitFrame]);

  useEffect(() => {
    if (session?.session_status === "stopped") stopCamera();
  }, [session?.session_status]);

  useEffect(() => () => stopCamera(), []);

  return (
    <section className="camera-panel" aria-label="Camera view">
      <div className={`camera-stage ${camState === "live" ? "camera-live" : "camera-placeholder"}`}>
        <video ref={videoRef} className="camera-video" playsInline muted aria-label="Live camera preview" />
        <canvas ref={overlayRef} width={960} height={540} className="camera-overlay" />
        {camState !== "live" && <div className="camera-empty"><span className="camera-empty-icon"><Camera size={28} /></span><strong>{camState === "error" ? "Camera access needs attention" : session?.demo_mode ? "Camera ready for a controlled demo" : "Camera view is off"}</strong><span>{session?.demo_mode && camState !== "error" ? "Use the demo scenes to preview the agent workflow." : "Camera access starts only when you tap Start camera."}</span></div>}
        <div className="camera-badge"><span className={camState === "live" ? "camera-live-dot" : "camera-idle-dot"} />{camState === "live" ? "CAMERA ACTIVE" : "CAMERA OFF"}</div>
        {objects.length > 0 && <div className="object-count"><ShieldAlert size={14} /> {objects.length} object{objects.length === 1 ? "" : "s"} detected</div>}
      </div>
      {camState === "error" && <div className="camera-error" role="alert">{camError}</div>}
      {backendWarning && <div className="camera-error" role="status">{backendWarning}</div>}
      {cameras.length > 1 && <label className="camera-select-label">Camera device<select className="camera-select" value={cameraSource} disabled={running} onChange={(event) => setCameraSource(event.target.value)}><option value="">Default / rear camera</option>{cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>}
      <div className="camera-actions">
        <button className="camera-start" onClick={() => void startCamera()} disabled={running || camState === "requesting"}><Camera size={17} />{camState === "requesting" ? "Starting camera…" : camState === "error" ? "Retry camera" : "Start camera"}</button>
        <button className="camera-stop" onClick={stopCamera} disabled={!running}><CircleStop size={17} /> Stop camera</button>
      </div>
      {session?.latest_observation && <p className="camera-meta"><Circle size={7} /> Last observation {new Date(session.latest_observation.timestamp).toLocaleTimeString()} · {session.latest_observation.processing_ms.toFixed(0)} ms · {session.latest_observation.source}{session.latest_observation.source !== "yolo" ? " (simulated or mock)" : ""}</p>}
      <canvas ref={canvasRef} className="hidden" />
    </section>
  );
}
