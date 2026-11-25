import { useEffect, useRef } from "react";
import { AppState, Image, Pressable, View } from "react-native";
import { Canvas, Fill, Shader, Skia, type SkRuntimeEffect } from "@shopify/react-native-skia";
import { useIsFocused } from "@react-navigation/native";
import { Easing, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from "react-native-reanimated";
import { ORB_SKSL } from "@/shader/orbShader";
import { SPHERE_PRESETS, SPHERE_STATES, flattenSphere, lerpSphere, sphereParams, type SpherePreset, type SphereState } from "@/shader/sphereStates";
import { useMotion } from "@/state/motion";
import { useSkiaReady } from "@/state/skia";

const sphereStill = require("../../assets/sphere-idle.png") as number;

let compiled: SkRuntimeEffect | null | undefined;

function orbEffect(): SkRuntimeEffect | null {
  if (compiled !== undefined) return compiled;
  try {
    compiled = Skia.RuntimeEffect.Make(ORB_SKSL);
  } catch {
    compiled = null;
  }
  return compiled;
}

export function PresenceSphere({
  preset,
  state,
  audioLevel = 0,
  onPress,
}: {
  preset: SpherePreset;
  state: SphereState;
  audioLevel?: number;
  onPress?: () => void;
}) {
  const { slot, canvas, radius } = SPHERE_PRESETS[preset];
  const ready = useSkiaReady();
  const { reduced } = useMotion();
  const focused = useIsFocused();
  const effect = ready ? orbEffect() : null;
  const initial = flattenSphere(sphereParams(state));
  const from = useSharedValue(initial);
  const to = useSharedValue(initial);
  const mix = useSharedValue(1);
  const phase = useSharedValue(0);
  const clock = useSharedValue(0);
  const liveAudio = useSharedValue(audioLevel);
  const targetIndex = useSharedValue(Math.max(0, SPHERE_STATES.indexOf(state)));
  const running = useSharedValue(1);
  const last = useRef(state);

  useEffect(() => {
    liveAudio.value = audioLevel;
  }, [audioLevel, liveAudio]);

  useEffect(() => {
    const active = AppState.addEventListener("change", (next) => {
      running.value = next === "active" && focused ? 1 : 0;
    });
    return () => active.remove();
  }, [focused, running]);

  useEffect(() => {
    running.value = focused && AppState.currentState === "active" ? 1 : 0;
  }, [focused, running]);

  useEffect(() => {
    targetIndex.value = Math.max(0, SPHERE_STATES.indexOf(state));
    if (last.current === state) return;
    const currentMix = mix.value;
    from.value = lerpSphere(from.value, to.value, Number.isFinite(currentMix) ? currentMix : 1);
    to.value = flattenSphere(sphereParams(state));
    last.current = state;
    mix.value = 0;
    mix.value = withTiming(1, {
      duration: state === "needsApproval" ? 280 : 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [from, mix, state, targetIndex, to]);

  useFrameCallback((frame) => {
    if (running.value < 0.5 || reduced.value > 0.5) return;
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    clock.value += dt;
    const speed = (from.value[15] ?? 0.24) + ((to.value[15] ?? 0.24) - (from.value[15] ?? 0.24)) * mix.value;
    phase.value += dt * speed;
  });

  const uniforms = useDerivedValue(() => {
    const t = mix.value;
    const at = (index: number) => {
      const left = from.value[index] ?? 0;
      const right = to.value[index] ?? left;
      return left + (right - left) * t;
    };
    const target = targetIndex.value;
    const live = liveAudio.value;
    let audio = at(21);
    if (target === 1) audio = live > 0.01 ? Math.min(0.75, Math.max(0.15, live)) : audio;
    else if (target === 3) {
      audio = live > 0.01 ? Math.min(0.6, Math.max(0.12, live)) : Math.min(0.6, Math.max(0.12, 0.36 + 0.18 * Math.sin(clock.value * 3.1)));
    }
    return {
      uRes: [canvas, canvas],
      uTime: phase.value,
      uClock: clock.value,
      uRadius: radius,
      uCore: [at(0), at(1), at(2)],
      uHi: [at(3), at(4), at(5)],
      uMid: [at(6), at(7), at(8)],
      uDeep: [at(9), at(10), at(11)],
      uEdge: [at(12), at(13), at(14)],
      uRing: [at(25), at(26), at(27)],
      uSpeed: 1,
      uSwirl: at(16),
      uBloom: at(17),
      uBreathAmp: at(18),
      uBreathFreq: at(19),
      uRingPulse: at(20),
      uAudio: audio,
      uCoreFocus: at(22),
      uCorePower: at(23),
      uFilamentGain: at(24),
      uReduced: reduced.value,
    };
  });

  const offset = (slot - canvas) / 2;
  const body = effect ? (
    <Canvas style={{ width: canvas, height: canvas }}>
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  ) : (
    <View style={{ width: canvas, height: canvas, alignItems: "center", justifyContent: "center" }}>
      <Image source={sphereStill} style={{ width: canvas, height: canvas }} resizeMode="contain" />
      {state === "needsApproval" ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: slot * 0.92,
            height: slot * 0.92,
            borderRadius: slot,
            borderWidth: 1.5,
            borderColor: "rgba(245, 158, 11, 0.22)",
          }}
        />
      ) : null}
    </View>
  );

  const frame = (
    <View pointerEvents="none" style={{ position: "absolute", width: canvas, height: canvas, left: offset, top: offset }}>
      {body}
    </View>
  );

  if (!onPress) {
    return <View style={{ width: slot, height: slot, overflow: "visible" }}>{frame}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Talk to Hatch"
      accessibilityHint="Opens voice mode"
      hitSlop={slot < 44 ? 8 : 0}
      style={{ width: slot, height: slot, overflow: "visible" }}
    >
      {frame}
    </Pressable>
  );
}
