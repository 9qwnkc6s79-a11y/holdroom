import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

interface SpeechNative {
  requestPermissions: () => Promise<boolean>;
  start: (locale: string) => Promise<{ onDevice?: boolean } | boolean>;
  startCapture: () => Promise<boolean>;
  stop: () => Promise<string | null>;
  addListener: (event: string, listener: (payload: Record<string, unknown>) => void) => { remove: () => void };
}

export const HOST_STT_UNAVAILABLE =
  "On-device speech isn’t available on this iPhone, and Hatch’s speech service is not connected on your firm’s host yet.";

export interface SpeechSession {
  onDevice: boolean;
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
  const detach = () => {
    result.remove();
    level.remove();
    error.remove();
  };
  try {
    const allowed = await native.requestPermissions();
    if (!allowed) {
      detach();
      return { error: "Hatch OS needs the microphone and speech recognition. Audio stays on this iPhone." };
    }
    try {
      await native.start("en-US");
      return {
        onDevice: true,
        stop: async () => {
          detach();
          try {
            return await native.stop();
          } catch {
            return null;
          }
        },
      };
    } catch {
      await native.startCapture();
      return {
        onDevice: false,
        stop: async () => {
          detach();
          try {
            return await native.stop();
          } catch {
            return null;
          }
        },
      };
    }
  } catch (caught) {
    detach();
    const message = caught instanceof Error ? caught.message : "Speech recognition is not available on this iPhone.";
    return { error: message };
  }
}

async function startWeb(handlers: {
  onText: (text: string) => void;
  onLevel: (level: number) => void;
}): Promise<SpeechSession | { error: string }> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return { error: HOST_STT_UNAVAILABLE };
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return { error: "Hatch OS needs the microphone. Audio is not sent to another company." };
  }
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  let closed = false;
  let audioContext: AudioContext | null = null;
  let frame = 0;
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
  recorder.start();
  return {
    onDevice: false,
    stop: async () => {
      closed = true;
      if (frame) cancelAnimationFrame(frame);
      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        try {
          recorder.stop();
        } catch {
          resolve(new Blob(chunks, { type: "audio/webm" }));
        }
      });
      stream.getTracks().forEach((track) => track.stop());
      await audioContext?.close().catch(() => undefined);
      return URL.createObjectURL(blob);
    },
  };
}
