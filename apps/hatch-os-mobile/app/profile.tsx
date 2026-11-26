import { useEffect, useState, type ReactNode } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { privacyUrl, termsUrl } from "@/api/config";
import { useRouter } from "expo-router";
import { getTokenBalance } from "@/api/client";
import type { TokenBalanceView } from "@/api/types";
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

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function ProfileScreen() {
  useRequireSession();
  const router = useRouter();
  const { session, signOut, deleteAccount } = useSession();
  const { status } = useHatch();
  const { timeZoneAuto, setTimeZoneAuto } = usePrefs();
  const [tokens, setTokens] = useState<TokenBalanceView | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const host = hostLine(status);
  const name = session?.testerLabel || session?.deviceName || "You";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Not set";
  const firm = workspaceName(session?.homeDepartment) || "Your firm";

  useEffect(() => {
    if (!session) return;
    void getTokenBalance().then(setTokens);
  }, [session]);

  async function openLegal(url: string) {
    if (Platform.OS === "web") {
      await Linking.openURL(url);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  }

  async function leave() {
    await signOut();
    router.replace("/sign-in");
  }

  async function confirmRemoveAccount() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount();
      setConfirmDelete(false);
      router.replace("/sign-in");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete account data.");
    } finally {
      setDeleting(false);
    }
  }

  const usageSubtitle = tokens
    ? tokens.unlimited
      ? "Unlimited beta access"
      : `${tokens.lifetimeUsedTokens.toLocaleString()} tokens used`
    : "Beta test allowance";
  const usageTrailing = tokens
    ? tokens.unlimited
      ? "Unlimited"
      : formatUsd(tokens.balanceCents)
    : "Beta";

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
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>
                {session?.inviteCode ? `Code ${session.inviteCode}` : "Signed in"}
              </T>
            </View>
          </View>
        </Card>
        <Card>
          <Row title="Usage" subtitle={usageSubtitle} trailing={<T style={[type.metaLabel, { color: colors.fgSecondary }]}>{usageTrailing}</T>} />
          <Row title="Plan" subtitle="Beta testing — included for invited testers" last />
        </Card>
        <Card>
          <Row title="Connect apps" subtitle="Gmail, Drive, Slack, Notion, and more" onPress={() => router.push("/plugins")} trailing={<IconChevron size={16} color={colors.dim} />} />
          <Row title="Library" subtitle="Search firm files, drafts, and synced items" onPress={() => router.push("/library")} trailing={<IconChevron size={16} color={colors.dim} />} />
          <Row title="Routines" subtitle="Scheduled briefs, reminders, and email alerts" onPress={() => router.push("/routines")} trailing={<IconChevron size={16} color={colors.dim} />} />
          <Row title="Model & Ethics" subtitle="Charter, tone, and firm model" last onPress={() => router.push("/ethics")} trailing={<IconChevron size={16} color={colors.dim} />} />
        </Card>
        <T style={[type.metaLabel, { color: colors.dim, marginBottom: 8, marginLeft: 4 }]}>Bot</T>
        <Card>
          <Row title="Permissions" subtitle="Always ask before external writes" />
          <Row title="Time zone automatic" subtitle={timeZoneAuto ? "Uses this iPhone" : "Held at the last zone"} trailing={<Switch value={timeZoneAuto} onValueChange={setTimeZoneAuto} label="Time zone automatic" />} />
          <Row title="Time zone" subtitle={zone} />
          <Row title="Firm host" subtitle={`${firm} · ${host.detail}. Work stays off OpenAI and Anthropic.`} />
          <Row title="Manage your devices" subtitle={session?.deviceName || "This iPhone"} last />
        </Card>
        <T style={[type.metaLabel, { color: colors.dim, marginBottom: 8, marginLeft: 4 }]}>Legal</T>
        <Card>
          <Row title="Privacy Policy" subtitle="hatchsystems.ai/privacy" onPress={() => void openLegal(privacyUrl())} trailing={<IconChevron size={16} color={colors.dim} />} />
          <Row title="Terms of Service" subtitle="hatchsystems.ai/terms" last onPress={() => void openLegal(termsUrl())} trailing={<IconChevron size={16} color={colors.dim} />} />
        </Card>
        <PressableScale accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void leave()} style={{ minHeight: 52, alignItems: "center", justifyContent: "center" }}>
          <T style={[type.rowTitle, { color: colors.fg }]}>Sign out</T>
        </PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel="Delete account and data" onPress={() => { setDeleteError(""); setConfirmDelete(true); }} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
          <T style={[type.cardSubcopy, { color: colors.amberSoft }]}>Delete account &amp; data</T>
        </PressableScale>
      </ScrollView>
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", paddingHorizontal: 24 }}>
          <Pressable accessibilityLabel="Cancel account deletion" onPress={() => !deleting && setConfirmDelete(false)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
          <View style={{ backgroundColor: "#18181B", borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 12 }}>
            <T style={[type.headerBrand, { color: colors.fg }]}>Delete account &amp; data?</T>
            <T style={[type.cardSubcopy, { color: colors.muted }]}>
              This removes your saved threads, uploaded files, connected app tokens, and Model &amp; Ethics settings from your firm’s host.
            </T>
            {deleteError ? <T style={[type.cardSubcopy, { color: colors.amberSoft }]}>{deleteError}</T> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <PressableScale accessibilityRole="button" accessibilityLabel="Cancel delete" disabled={deleting} onPress={() => setConfirmDelete(false)} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                <T style={[type.ctaLabel, { color: colors.fg }]}>Cancel</T>
              </PressableScale>
              <PressableScale accessibilityRole="button" accessibilityLabel="Confirm delete account" disabled={deleting} onPress={() => void confirmRemoveAccount()} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: "#B91C1C", alignItems: "center", justifyContent: "center", opacity: deleting ? 0.6 : 1 }}>
                <T style={[type.ctaLabel, { color: colors.white }]}>{deleting ? "Deleting…" : "Delete"}</T>
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
