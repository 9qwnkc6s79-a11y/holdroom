import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { HatchMark } from "@/components/icons";
import { PresenceSphere } from "@/components/PresenceSphere";
import { Screen, T } from "@/components/chrome";
import { useMotion } from "@/state/motion";
import { useSession } from "@/state/session";
import { type } from "@/theme/presenceTokens";

export default function SplashScreen() {
  const router = useRouter();
  const { ready, session } = useSession();
  const { systemReduced } = useMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!ready) return;
    const destination = session ? "/(tabs)/home" : "/sign-in";
    if (systemReduced) {
      progress.value = 1;
      const timer = setTimeout(() => router.replace(destination), 400);
      return () => clearTimeout(timer);
    }
    progress.value = withTiming(1, { duration: 1350, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(() => router.replace(destination), 1350);
    return () => clearTimeout(timer);
  }, [progress, ready, router, session, systemReduced]);

  const mark = useAnimatedStyle(() => {
    const value = progress.value;
    const fade = value < 0.33 ? 1 : value > 0.7 ? 0 : 1 - (value - 0.33) / 0.37;
    const scale = value < 0.33 ? 1 : 1 + Math.min(1, (value - 0.33) / 0.37) * 1.6;
    return { opacity: fade, transform: [{ scale }] };
  });
  const sphere = useAnimatedStyle(() => {
    const value = progress.value;
    const opacity = value < 0.33 ? 0 : value > 0.7 ? 1 : (value - 0.33) / 0.37;
    return { opacity };
  });
  const word = useAnimatedStyle(() => {
    const value = progress.value;
    const opacity = value < 0.68 ? 0 : Math.min(1, (value - 0.68) / 0.16);
    return { opacity };
  });

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", transform: [{ translateY: -36 }] }}>
        <View style={{ width: 176, height: 176, alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={[{ position: "absolute" }, mark]}>
            <HatchMark size={72} />
          </Animated.View>
          <Animated.View style={sphere}>
            <PresenceSphere preset="splash" state="idle" />
          </Animated.View>
        </View>
        <Animated.View style={[{ alignItems: "center", marginTop: 18, gap: 8 }, word]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <HatchMark size={22} />
            <T style={[type.splashMark, { color: "#FAFAFA" }]}>Hatch</T>
          </View>
          <T style={[type.cardSubcopy, { color: "#A1A1AA" }]}>Your firm’s AI. On your firm’s knowledge.</T>
        </Animated.View>
      </View>
    </Screen>
  );
}
