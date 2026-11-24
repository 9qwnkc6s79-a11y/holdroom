import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Switch, T } from "@/components/chrome";
import { IconChevron, IconClose } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { hostLine, initials, workspaceName } from "@/lib/derive";
import { useHatch } from "@/state/hatch";
import { usePrefs } from "@/state/prefs";
import { useRequireSession, useSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

function Card({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>{children}</View>;
}

function Row({ title, subtitle, onPress, trailing, last = false }: { title: string; subtitle?: string; onPress?: () => void; trailing?: ReactNode; last?: boolean }) {
  const body = (
    <View style={{ minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <View style={{ flex: 1 }}>
        <T style={[type.rowTitle, { color: colors.fg }]}>{title}</T>
        {subtitle ? <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>{subtitle}</T> : null}
      </View>
      {trailing}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
      {body}
    </PressableScale>
  );
}

export default function ProfileScreen() {
  useRequireSession();
  const router = useRouter();
  const { session, signOut } = useSession();
  const { status } = useHatch();
  const { timeZoneAuto, setTimeZoneAuto } = usePrefs();
  const host = hostLine(status);
  const name = session?.testerLabel || session?.deviceName || "You";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Not set";
  const firm = workspaceName(session?.homeDepartment) || "Your firm";

  async function leave() {
    await signOut();
    router.replace("/sign-in");
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Close profile" onPress={() => (router.canGoBack() ? router.back() : router.replace("/bots"))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconClose size={18} color={colors.fg} />
        </PressableScale>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <Card>
          <View style={{ minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.avatarBg, alignItems: "center", justifyContent: "center" }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>{initials(name)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>{name}</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>No email on this sign-in</T>
            </View>
            <IconChevron size={16} color={colors.dim} />
          </View>
        </Card>
        <Card>
          <Row title="Usage" subtitle="Not reported by the host" trailing={<T style={[type.metaLabel, { color: colors.dim }]}>—</T>} />
          <Row title="Plan" subtitle="Not set" last trailing={<IconChevron size={16} color={colors.dim} />} />
        </Card>
        <Card>
          <Row title="Connect apps" subtitle="Search plugins" last onPress={() => router.push("/plugins")} trailing={<IconChevron size={16} color={colors.dim} />} />
        </Card>
        <T style={[type.metaLabel, { color: colors.dim, marginBottom: 8, marginLeft: 4 }]}>Bot</T>
        <Card>
          <Row title="Permissions" subtitle="Always ask before external writes" />
          <Row title="Time zone automatic" subtitle={timeZoneAuto ? "Uses this iPhone" : "Held at the last zone"} trailing={<Switch value={timeZoneAuto} onValueChange={setTimeZoneAuto} label="Time zone automatic" />} />
          <Row title="Time zone" subtitle={timeZoneAuto ? zone : zone} />
          <Row title="Firm host" subtitle={`${firm} · ${host.detail}. Work stays off OpenAI and Anthropic.`} />
          <Row title="Manage your devices" subtitle={session?.deviceName || "This iPhone"} />
          <Row title="Import memory" subtitle="Not available yet" last />
        </Card>
        <PressableScale accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void leave()} style={{ minHeight: 52, alignItems: "center", justifyContent: "center" }}>
          <T style={[type.rowTitle, { color: colors.fg }]}>Sign out</T>
        </PressableScale>
      </ScrollView>
    </Screen>
  );
}
