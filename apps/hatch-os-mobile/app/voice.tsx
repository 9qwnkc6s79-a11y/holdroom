import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { transcribeClip } from "@/api/client";
import { PressableScale } from "@/components/PressableScale";
import { PresenceSphere } from "@/components/PresenceSphere";
import { Screen, StatusLine, T } from "@/components/chrome";
import { IconLock, IconMic } from "@/components/icons";
import { oneParam } from "@/lib/derive";
import { hapticLight } from "@/lib/haptics";
import { startListening, type SpeechSession } from "@/lib/speech";
import { useHatch } from "@/state/hatch";
import { useMotion } from "@/state/motion";
import { usePrefs } from "@/state/prefs";
import { useRequireSession } from "@/state/session";
import type { SphereState } from "@/shader/sphereStates";
import { colors, type } from "@/theme/presenceTokens";

export default function VoiceScreen() {
  useRequireSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ agent?: string; thread?: string }>();
  const { agents, send } = useHatch();
  const { voice } = usePrefs();
  const { systemReduced } = useMotion();
  const requested = oneParam(params.agent);
  const threadId = oneParam(params.thread);
  const agent = agents.find((item) => item.id === requested) || agents[0];
  const [transcript, setTranscript] = useState("");
  const [level, setLevel] = useState(0);
  const [phase, setPhase] = useState<SphereState>(voice ? "listening" : "idle");
  const [hint, setHint] = useState(voice ? "Hatch is listening." : "Voice mode is off. Turn it on in Settings.");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const hearing = useRef<SpeechSession | null>(null);
  const text = useRef("");
  const cursor = useSharedValue(1);

  useEffect(() => {
    if (systemReduced) return;
    cursor.value = withRepeat(withTiming(0.2, { duration: 530, easing: Easing.out(Easing.cubic) }), -1, true);
  }, [cursor, systemReduced]);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: systemReduced ? 1 : cursor.value }));

  useEffect(() => {
    if (!voice) return;
    let cancelled = false;
    void (async () => {
      const started = await startListening({
        onText: (value) => {
          if (cancelled) return;
          text.current = value;
          setTranscript(value);
        },
        onLevel: (value) => {
          if (!cancelled) setLevel(value);
        },
      });
      if (cancelled) {
        if (!("error" in started)) void started.stop();
        return;
      }
      if ("error" in started) {
        setHint(started.error);
        setPhase("idle");
        return;
      }
      hearing.current = started;
    })();
    return () => {
      cancelled = true;
      void hearing.current?.stop();
      hearing.current = null;
      Speech.stop();
    };
  }, [voice]);

  function close() {
    Speech.stop();
    void hearing.current?.stop();
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }

  async function toggleMute() {
    void hapticLight();
    if (!muted) {
      setMuted(true);
      setPhase("idle");
      setHint("Muted");
      await hearing.current?.stop();
      hearing.current = null;
      return;
    }
    setMuted(false);
    setPhase("listening");
    setHint("Hatch is listening.");
    const started = await startListening({
      onText: (value) => {
        text.current = value;
        setTranscript(value);
      },
      onLevel: setLevel,
    });
    if ("error" in started) {
      setHint(started.error);
      setPhase("idle");
      return;
    }
    hearing.current = started;
  }

  async function end() {
    if (busy) return;
    setBusy(true);
    const clip = await hearing.current?.stop();
    hearing.current = null;
    let spoken = (text.current || transcript).trim();
    if (!spoken && clip) {
      try {
        const heard = await transcribeClip({ uri: clip, name: "voice.wav", mimeType: "audio/wav" });
        if (heard.text && !heard.stub) spoken = heard.text.trim();
        else if (heard.note) setHint(heard.note);
      } catch {
        setHint("Hatch could not read that. Try again, or type it instead.");
      }
    }
    if (!spoken || !agent) {
      close();
      return;
    }
    setTranscript(spoken);
    setPhase("thinking");
    setHint("Thinking");
    const result = await send({ agentId: agent.id, threadId, text: spoken, voice: true });
    if (!result.text || result.failed) {
      router.replace(threadId ? `/chat/${agent.id}?thread=${encodeURIComponent(threadId)}` : `/chat/${agent.id}`);
      return;
    }
    setPhase("speaking");
    setHint("Speaking");
    await new Promise<void>((resolve) => {
      Speech.speak(result.text.slice(0, 600), {
        language: "en-US",
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
    router.replace(threadId ? `/chat/${agent.id}?thread=${encodeURIComponent(threadId)}` : `/chat/${agent.id}`);
  }

  const label = muted ? "Muted" : phase === "thinking" ? "Thinking" : phase === "speaking" ? "Speaking" : "Listening";

  return (
    <Screen>
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <StatusLine color={colors.blueSky} text={label} />
          <PressableScale
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={{ height: 36, paddingHorizontal: 16, borderRadius: 99, backgroundColor: colors.surfaceButton, alignItems: "center", justifyContent: "center" }}
          >
            <T style={[type.body, { color: colors.fg, fontWeight: "600" }]}>Close</T>
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
          <IconLock size={12} color={colors.muted} />
          <T style={{ fontSize: 12, lineHeight: 16, color: colors.muted }} maxFontSizeMultiplier={1.25}>
            Private · Never sent to OpenAI or Anthropic
          </T>
        </View>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <PresenceSphere preset="voice" state={muted ? "idle" : phase} audioLevel={muted ? 0 : level} />
        <View style={{ height: 22 }} />
        <StatusLine color={colors.blueSky} text={hint} centered />
        <View style={{ marginTop: 22, maxWidth: 324, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
          {transcript ? (
            <T style={[type.transcript, { color: colors.fgSecondary, textAlign: "center" }]}>{transcript}</T>
          ) : (
            <T style={[type.subcopy, { color: colors.muted, textAlign: "center" }]}>Your words will appear here.</T>
          )}
          {phase === "listening" && !muted ? <Animated.View style={[{ width: 2, height: 20, backgroundColor: colors.blueSky, marginLeft: 4, alignSelf: "center" }, cursorStyle]} /> : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingBottom: 18 }}>
        <PressableScale
          onPress={() => void toggleMute()}
          accessibilityRole="button"
          accessibilityLabel={muted ? "Unmute" : "Mute"}
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceButton, alignItems: "center", justifyContent: "center" }}
        >
          <IconMic size={20} color={muted ? colors.dim : colors.fg} />
        </PressableScale>
        <PressableScale
          onPress={() => void end()}
          accessibilityRole="button"
          accessibilityLabel="End voice"
          style={{ height: 56, paddingHorizontal: 28, borderRadius: 99, backgroundColor: colors.fg, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}
        >
          <T style={[type.ctaLabel, { color: colors.bg }]}>End voice</T>
        </PressableScale>
      </View>
    </Screen>
  );
}
