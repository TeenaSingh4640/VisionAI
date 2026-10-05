import * as Speech from 'expo-speech';

export type VoiceEvent = {
  text: string;
  priority: number;
  expires_after_ms: number;
  deduplication_key: string;
  created_at?: string;
};

type Queued = { item: VoiceEvent; expiresAt: number; rate: number };
const queue: Queued[] = [];
const recent = new Map<string, number>();
let active = false;
let activePriority = 5;
let token = 0;

function clean() {
  const now = Date.now();
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].expiresAt <= now) queue.splice(i, 1);
  for (const [key, expiry] of recent) if (expiry <= now) recent.delete(key);
}

export function enqueueSpeech(item: VoiceEvent, rate = 1) {
  if (!item.text?.trim()) return;
  clean();
  const key = item.deduplication_key || item.text;
  if (recent.has(key)) return;
  recent.set(key, Date.now() + Math.max(item.expires_after_ms, 8_000));
  if (queue.length >= 12) {
    let lowest = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].item.priority > queue[lowest].item.priority) lowest = i;
    if (queue[lowest].item.priority <= item.priority) return;
    queue.splice(lowest, 1);
  }
  queue.push({ item, expiresAt: Date.now() + item.expires_after_ms, rate });
  queue.sort((a, b) => a.item.priority - b.item.priority || Date.parse(a.item.created_at ?? '') - Date.parse(b.item.created_at ?? ''));
  if (active && item.priority <= 2 && item.priority < activePriority) {
    active = false;
    activePriority = 5;
    const current = ++token;
    void Speech.stop().finally(() => { if (token === current) drain(); });
  } else drain();
}

function drain() {
  if (active) return;
  clean();
  const next = queue.shift();
  if (!next) return;
  active = true;
  activePriority = next.item.priority;
  const current = ++token;
  const finish = () => {
    if (current !== token) return;
    active = false;
    activePriority = 5;
    drain();
  };
  Speech.speak(next.item.text, {
    rate: Math.max(0.6, Math.min(1.5, next.rate)),
    onDone: finish,
    onStopped: finish,
    onError: finish,
  });
}

export function stopSpeechQueue() {
  queue.length = 0;
  active = false;
  activePriority = 5;
  token++;
  void Speech.stop();
}
