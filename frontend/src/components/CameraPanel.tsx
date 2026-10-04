import { useEffect, useRef, useState } from "react";
import { useSession } from "../context/SessionContext";
import type { DetectedObject } from "../types";
import { BigButton, Card, StatusPill } from "./ui";

export function CameraPanel() {
  const { session, submitFrame, cameraSource, developerMode, loadDemo } = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [camState, setCamState] = useState<"idle" | "requesting" | "live" | "error">("idle");
  const [camError, setCamError] = useState("");
  const [running, setRunning] = useState(false);
  const timer = useRef<number>();

  const objects: DetectedObject[] = session?.latest_observation?.objects ?? [];

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objects.forEach((obj) => {
      const x = obj.bbox.x1 * canvas.width;
      const y = obj.bbox.y1 * canvas.height;
      const w = (obj.bbox.x2 - obj.bbox.x1) * canvas.width;
      const h = (obj.bbox.y2 - obj.bbox.y1) * canvas.height;
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      const label = `${obj.class_name} ${Math.round(obj.confidence * 100)}%${developerMode && obj.track_id != null ? ` #${obj.track_id}` : ""}`;
      ctx.font = "16px sans-serif";
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(7,17,31,0.85)";
      ctx.fillRect(x, Math.max(0, y - 22), tw, 22);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(label, x + 5, Math.max(16, y - 6));
    });
  }, [objects, developerMode]);

  async function startCamera() {
    setCamState("requesting");
    setCamError("");
    try {
      const constraints: MediaStreamConstraints = {
        video: cameraSource ? { deviceId: { exact: cameraSource } } : { facingMode: "environment" },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamState("live");
      setRunning(true);
    } catch {
      setCamState("error");
      setCamError("Camera permission was denied or the device is unavailable.");
    }
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    setCamState("idle");
    if (timer.current) window.clearInterval(timer.current);
  }

  useEffect(() => {
    if (!running || !session || session.demo_mode || session.session_status === "paused") return;
    timer.current = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      canvas.width = 480;
      canvas.height = 270;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      void submitFrame(canvas.toDataURL("image/jpeg", 0.7));
    }, 1600);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running, session, submitFrame]);

  useEffect(() => () => stopCamera(), []);

  return (
    <Card
      title="Camera"
      actions={
        <StatusPill
          label={camState === "live" ? "Camera live" : camState === "error" ? "Camera unavailable" : "Camera idle"}
          tone={camState === "live" ? "ok" : camState === "error" ? "urgent" : "info"}
        />
      }
    >
      <div className="relative overflow-hidden rounded-xl bg-black aspect-video">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-label="Live camera preview" />
        <canvas ref={overlayRef} width={960} height={540} className="pointer-events-none absolute inset-0 h-full w-full" />
        {camState !== "live" && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-950/70 p-6 text-center">
            <p className="max-w-md text-slate-300">
              {session?.demo_mode
                ? "Demo mode is on. Use the demonstration panel to load controlled scenes. Live camera inference is optional."
                : camError || "Start the camera to send sampled frames for perception. Frames are not stored by default."}
            </p>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="mt-3 flex flex-wrap gap-2">
        <BigButton onClick={startCamera} disabled={running}>
          Start camera
        </BigButton>
        <BigButton tone="neutral" onClick={stopCamera} disabled={!running}>
          Stop camera
        </BigButton>
        {session?.demo_mode && (
          <BigButton tone="neutral" onClick={() => void loadDemo("clear")}>
            Use demo video scenes
          </BigButton>
        )}
      </div>
      {session?.latest_observation && (
        <p className="mt-3 text-sm text-slate-400">
          Last observation {new Date(session.latest_observation.timestamp).toLocaleTimeString()} ·{" "}
          {session.latest_observation.processing_ms.toFixed(0)} ms · source {session.latest_observation.source}
          {session.latest_observation.source !== "yolo" ? " (not live YOLO output)" : ""}
        </p>
      )}
    </Card>
  );
}
