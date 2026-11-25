import { useRouter } from "expo-router";
import { Screen, T } from "@/components/chrome";
import { PressableScale } from "@/components/PressableScale";
import { colors, type } from "@/theme/presenceTokens";

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <T style={[type.pageTitle, { color: colors.fg, margin: 24 }]}>That screen is not in Hatch.</T>
      <PressableScale onPress={() => router.replace("/")} accessibilityRole="button" style={{ marginHorizontal: 24, height: 50, borderRadius: 14, backgroundColor: colors.blueButton, alignItems: "center", justifyContent: "center" }}>
        <T style={[type.ctaLabel, { color: colors.white }]}>Back to Hatch</T>
      </PressableScale>
    </Screen>
  );
}
