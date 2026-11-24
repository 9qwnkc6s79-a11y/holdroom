import type { ReactNode } from "react";
import Constants from "expo-constants";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { BackButton, Screen, Switch, T, monoRegular } from "@/components/chrome";
import { IconChevron } from "@/components/icons";
import { hostLine } from "@/lib/derive";
import { PressableScale } from "@/components/PressableScale";
import { useHatch } from "@/state/hatch";
import { useMotion } from "@/state/motion";
import { usePrefs } from "@/state/prefs";
import { useRequireSession, useSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

export default function SettingsScreen() {
  useRequireSession();
  const router = useRouter();
  const { signOut, session } = useSession();
  const { status } = useHatch();
  const { voice, haptics, setVoice, setHaptics } = usePrefs();
  const { systemReduced } = useMotion();
  const host = hostLine(status);

  async function leave() {
    await signOut();
    router.replace("/sign-in");
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: 8 }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <T style={[type.pageTitle, { color: colors.fg, marginTop: 4, marginBottom: 18 }]}>Settings</T>
        <Group label="Your firm’s host">
          <Row>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Private host</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>{host.detail}</T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: host.connected ? colors.blueSky : colors.dim }} />
              <T style={[type.metaLabel, { color: colors.muted }]}>{host.connected ? "Connected" : "Offline"}</T>
            </View>
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Model boundary</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Never sent to OpenAI or Anthropic</T>
            </View>
          </Row>
          <Row last>
            <View style={{ flex: 1 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Send approvals</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Always ask before external writes</T>
            </View>
          </Row>
        </Group>
        <Group label="Voice & motion">
          <Row>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Voice mode</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Tap the sphere or mic to speak</T>
            </View>
            <Switch value={voice} onValueChange={setVoice} label="Voice mode" />
          </Row>
          <Row>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Haptics</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Tactile feedback on approvals and state shifts</T>
            </View>
            <Switch value={haptics} onValueChange={setHaptics} label="Haptics" />
          </Row>
          <Row last>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Reduce Motion</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Follows your iPhone Accessibility setting</T>
            </View>
            <T style={[type.metaLabel, { color: colors.muted }]}>{systemReduced ? "On" : "Off"}</T>
          </Row>
        </Group>
        <Group label="Account">
          <Row>
            <T style={[type.rowTitle, { color: colors.fg, flex: 1 }]}>Appearance</T>
            <T style={[type.metaLabel, { color: colors.muted }]}>Dark (v1)</T>
          </Row>
          <PressableScale onPress={() => void leave()} accessibilityRole="button" accessibilityLabel="Sign out" style={{ minHeight: 50, paddingHorizontal: 16, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Sign out</T>
              {session?.role ? <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>{session.role} · {session.deviceName}</T> : null}
            </View>
            <IconChevron size={16} color={colors.muted} />
          </PressableScale>
        </Group>
        <T style={[monoRegular, { fontSize: 12, lineHeight: 16, color: "#71717A", textAlign: "center", marginTop: 28 }]}>{appStamp()}</T>
      </ScrollView>
    </Screen>
  );
}

function appStamp(): string {
  const version = (Constants.expoConfig?.version || "1.0.0").replace(/\.0$/, "");
  const build = Constants.nativeBuildVersion || Constants.expoConfig?.ios?.buildNumber || "1";
  return `Hatch OS ${version} (build ${build})`;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <T style={[type.metaLabel, { color: colors.muted, marginBottom: 8 }]}>{label}</T>
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

function Row({ children, last = false }: { children: ReactNode; last?: boolean }) {
  return (
    <View style={{ minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.lineSubtle }}>
      {children}
    </View>
  );
}
