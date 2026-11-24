import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

interface SpeechNative {
  requestPermissions: () => Promise<boolean>;
  start: (locale: string) => Promise<boolean>;
  stop: () => Promise<string | null>;
  addListener: (event: string, listener: (payload: Record<string, unknown>) => void) => { remove: () => void };
}

export interface SpeechSession {
  stop: () => Promise<string | null>;
}

function iosModule(): SpeechNative | null {
  if (Platform.OS !== "ios") return null;
  return requireOptionalNativeModule<SpeechNative>("HatchSpeech");
}

export async function startListening(handlers: {
  onText: (text: string) => void;
  onLevel: (level: number) => void;
}): Promise<SpeechSession | { error: string }> {
  const native = iosModule();
  if (native) return startIos(native, handlers);
  if (Platform.OS === "web") return startWeb(handlers);
  return { error: "Voice mode on this build listens through the iPhone speech service." };
}

async function startIos(
  native: SpeechNative,
  handlers: { onText: (text: string) => void; onLevel: (level: number) => void },
): Promise<SpeechSession | { error: string }> {
  let smooth = 0;
  const result = native.addListener("result", (payload) => {
    if (typeof payload.text === "string") handlers.onText(payload.text);
  });
  const level = native.addListener("level", (payload) => {
    if (typeof payload.value !== "number") return;
    smooth = smooth * 0.35 + payload.value * 0.65;
    handlers.onLevel(Math.max(0, Math.min(1, smooth)));
  });
  const error = native.addListener("error", () => undefined);
  try {
    const allowed = await native.requestPermissions();
    if (!allowed) {
      result.remove();
      level.remove();
      error.remove();
      return { error: "Hatch OS needs the microphone and speech recognition to listen." };
    }
    await native.start("en-US");
  } catch (caught) {
    result.remove();
    level.remove();
    error.remove();
    const message = caught instanceof Error ? caught.message : "Speech recognition is not available on this iPhone.";
    return { error: message };
  }
  return {
    stop: async () => {
      result.remove();
      level.remove();
      error.remove();
      try {
        return await native.stop();
      } catch {
        return null;
      }
    },
  };
}

async function startWeb(handlers: {
  onText: (text: string) => void;
  onLevel: (level: number) => void;
}): Promise<SpeechSession | { error: string }> {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  const Ctor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  if (!Ctor) return { error: "Speech recognition is not available in this browser." };
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onresult = (event) => {
    const pieces: string[] = [];
    for (let index = 0; index < event.results.length; index += 1) {
      const piece = event.results[index]?.[0]?.transcript;
      if (piece) pieces.push(piece);
    }
    handlers.onText(pieces.join(" ").trim());
  };
  let closed = false;
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let frame = 0;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audioContext = new Ctx();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const bins = new Float32Array(analyser.fftSize);
      let smooth = 0;
      const tick = () => {
        if (closed) return;
        analyser.getFloatTimeDomainData(bins);
        let sum = 0;
        for (const sample of bins) sum += sample * sample;
        const rms = Math.sqrt(sum / bins.length);
        smooth = smooth * 0.4 + Math.min(1, rms * 8) * 0.6;
        handlers.onLevel(smooth);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
  } catch {
    /* The transcript can still arrive without a level meter. */
  }
  try {
    recognition.start();
  } catch {
    return { error: "Hatch could not start listening." };
  }
  return {
    stop: async () => {
      closed = true;
      if (frame) cancelAnimationFrame(frame);
      try {
        recognition.stop();
      } catch {
        /* Already stopped. */
      }
      stream?.getTracks().forEach((track) => track.stop());
      await audioContext?.close().catch(() => undefined);
      return null;
    },
  };
}

interface SpeechResult {
  readonly isFinal: boolean;
  readonly [index: number]: { transcript: string } | undefined;
}

interface SpeechEvent {
  readonly results: { length: number; [index: number]: SpeechResult | undefined };
}

interface SpeechHandle {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechCtor {
  new (): SpeechHandle;
}
