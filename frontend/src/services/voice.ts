let lastSpoken = "";
let speaking = false;

export function speak(text: string, rate: number, force = false) {
  if (!("speechSynthesis" in window)) return false;
  if (!force && (text === lastSpoken || speaking)) return false;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = Math.min(2, Math.max(0.6, rate));
  utter.onend = () => {
    speaking = false;
  };
  speaking = true;
  lastSpoken = text;
  window.speechSynthesis.speak(utter);
  return true;
}

export function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  speaking = false;
}

export function listenOnce(): Promise<string> {
  return new Promise((resolve, reject) => {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition
      || (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition;
    if (!SR) {
      reject(new Error("Speech recognition is not supported in this browser."));
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: SpeechRecognitionEvent) => resolve(ev.results[0][0].transcript);
    rec.onerror = () => reject(new Error("Voice command was not understood."));
    rec.start();
  });
}

interface SpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
}

interface SpeechRecognitionEvent {
  results: { 0: { 0: { transcript: string } } };
}
