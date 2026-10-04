import type { AudioEvent } from "../types";

let speechMuted = false;
let activePriority = 5;
let queue: Array<{ event: AudioEvent; expiresAt: number; rate: number }> = [];
let recent = new Map<string, number>();
let playbackId = 0;
const MAX_QUEUE = 12;

export function isSpeechMuted() { return speechMuted; }

export function setSpeechMuted(value: boolean) {
  speechMuted = value;
  if (value) stopSpeech();
  else drain();
}

function purge() {
  const now = Date.now();
  queue = queue.filter((item) => item.expiresAt > now);
  for (const [key, expiry] of recent) if (expiry <= now) recent.delete(key);
}

export function enqueueAudioEvent(event: AudioEvent, rate = 1) {
  if (speechMuted || !event.text || typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  purge();
  const key = event.deduplication_key || event.text;
  if (recent.has(key)) return false;
  recent.set(key, Date.now() + Math.max(8_000, event.expires_after_ms));
  const item = { event: { ...event, text: event.text, priority: Math.max(1, Math.min(4, event.priority)) }, expiresAt: Date.now() + event.expires_after_ms, rate };
  if (queue.length >= MAX_QUEUE) {
    const lowest = queue.reduce((best, candidate, i) => candidate.event.priority > queue[best].event.priority ? i : best, 0);
    if (queue[lowest].event.priority <= item.event.priority) return false;
    queue.splice(lowest, 1);
  }
  queue.push(item);
  queue.sort((a, b) => a.event.priority - b.event.priority || Date.parse(a.event.created_at) - Date.parse(b.event.created_at));
  if (item.event.priority <= 2 && activePriority > item.event.priority) {
    playbackId++;
    activePriority = 5;
    window.speechSynthesis.cancel();
    window.setTimeout(drain, 0);
  }
  drain();
  return true;
}

function drain() {
  if (speechMuted || typeof window === "undefined" || !("speechSynthesis" in window) || window.speechSynthesis.speaking) return;
  purge();
  const item = queue.shift();
  if (!item) { activePriority = 5; return; }
  const id = ++playbackId;
  activePriority = item.event.priority;
  const utterance = new SpeechSynthesisUtterance(item.event.text);
  utterance.rate = Math.min(2, Math.max(0.6, item.rate || 1));
  const done = () => { if (id !== playbackId) return; activePriority = 5; window.setTimeout(drain, 0); };
  utterance.onend = done;
  utterance.onerror = done;
  window.speechSynthesis.speak(utterance);
}

export function speak(text: string, rate: number, force = false) {
  if (speechMuted || !text || typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  if (force) stopSpeech();
  const event: AudioEvent = {
    event_id: `local-${Date.now()}`, source: "system", category: "system_alert", priority: 2,
    text, created_at: new Date().toISOString(), expires_after_ms: 30_000,
    deduplication_key: force ? `local:${Date.now()}` : `local:${text}`,
    simulated: false,
  };
  return enqueueAudioEvent(event, rate);
}

export function stopSpeech() {
  playbackId++;
  queue = [];
  activePriority = 5;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function listenOnce(): Promise<string> {
  return new Promise((resolve, reject) => {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition
      || (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition;
    if (!SR) { reject(new Error("Speech recognition is not supported in this browser.")); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (ev: SpeechRecognitionEvent) => resolve(ev.results[0][0].transcript);
    rec.onerror = () => reject(new Error("Voice command was not understood."));
    rec.start();
  });
}

interface SpeechRecognition { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((ev: SpeechRecognitionEvent) => void) | null; onerror: (() => void) | null; start: () => void; }
interface SpeechRecognitionEvent { results: { 0: { 0: { transcript: string } } }; }
