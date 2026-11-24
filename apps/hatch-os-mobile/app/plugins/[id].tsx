import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EmptyNote, Screen, T } from "@/components/chrome";
import { IconClose } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { connectWithToken, disconnectAccount, loadConnectors, probeOAuth, oauthReturnUrl, syncProvider, type ConnectedAccount } from "@/api/connectors";
import { oneParam } from "@/lib/derive";
import { pluginById } from "@/plugins/catalog";
import { useRequireSession, useSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

WebBrowser.maybeCompleteAuthSession();

export default function PluginDetailScreen() {
  useRequireSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const plugin = pluginById(oneParam(params.id) || "");
  const { session } = useSession();
  const [connected, setConnected] = useState<ConnectedAccount[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const accounts = plugin?.provider ? connected.filter((account) => account.kind === plugin.provider) : [];

  const refresh = useCallback(async () => {
    if (!session?.inviteCode) return;
    try {
      const data = await loadConnectors(session.inviteCode);
      setConnected(data.connected || []);
    } catch {
      setConnected([]);
    }
  }, [session?.inviteCode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connect() {
    if (!plugin?.provider || !session) return;
    setError("");
    setNote("");
    if (plugin.auth === "oauth") {
      setBusy(true);
      try {
        const probe = await probeOAuth(plugin.provider, session.inviteCode);
        if (!probe.authorizeUrl) {
          setNote(probe.message || "OAuth is not configured on the host yet. Nothing was connected.");
          return;
        }
        if (Platform.OS === "web") {
          setNote("Connect opens in the iPhone browser. This preview cannot finish the sign-in.");
          return;
        }
        const result = await WebBrowser.openAuthSessionAsync(probe.authorizeUrl, oauthReturnUrl());
        if (result.type !== "success" || !result.url.includes("ok=1")) {
          setError("The sign-in did not finish.");
          return;
        }
        await refresh();
        const kind = plugin.provider === "microsoft" ? "microsoft" : "google";
        const synced = await syncProvider(session.inviteCode, kind, session.homeDepartment).catch((err: unknown) => {
          setNote(err instanceof Error ? err.message : "Connected. The file room copy did not finish.");
          return null;
        });
        if (synced && "detail" in synced && synced.detail) setNote(synced.detail);
        else if (synced && "error" in synced && synced.error) setNote(synced.error);
        else setNote("Connected.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not connect.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, string> = { kind: plugin.provider };
      if (plugin.auth === "password") {
        body.email = email.trim();
        body.password = password;
        body.preset = email.toLowerCase().includes("outlook") || email.toLowerCase().includes("hotmail") ? "outlook" : "gmail";
      } else if (plugin.auth === "url") {
        body.url = url.trim();
        if (token.trim()) body.token = token.trim();
      } else {
        body.token = token.trim();
      }
      await connectWithToken(session.inviteCode, body);
      setToken("");
      setPassword("");
      setNote("Connected.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(id: string) {
    if (!session) return;
    setError("");
    await disconnectAccount(session.inviteCode, id);
    setNote("Disconnected.");
    await refresh();
  }

  if (!plugin) {
    return (
      <Screen>
        <EmptyNote title="Unknown plugin" body="That plugin is not in the catalog." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Close plugin" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconClose size={18} color={colors.fg} />
        </PressableScale>
        <T style={[type.headerBrand, { color: colors.fg }]}>{plugin.name}</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <T style={[type.body, { color: colors.fgBody }]}>{plugin.blurb}</T>
        <T style={[type.cardSubcopy, { color: colors.muted }]}>
          {plugin.wired
            ? "Copies stay in your firm’s file room. They are not sent to OpenAI or Anthropic."
            : "Coming soon. This plugin is not connected, and Hatch will not pretend that it is."}
        </T>
        {error ? <T style={[type.cardSubcopy, { color: colors.amberSoft }]}>{error}</T> : null}
        {note ? <T style={[type.cardSubcopy, { color: colors.fg }]}>{note}</T> : null}
        <T style={[type.rowTitle, { color: colors.fg }]}>Accounts</T>
        {accounts.length === 0 ? <EmptyNote title="No accounts connected" body={plugin.wired ? "Connect an account when you are ready." : "Nothing to connect until the host supports this plugin."} /> : null}
        {accounts.map((account) => (
          <View key={account.id} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 8 }}>
            <T style={[type.rowTitle, { color: colors.fg }]}>{account.label}</T>
            <T style={[type.cardSubcopy, { color: colors.muted }]}>{account.detail || "Connected"}</T>
            <PressableScale accessibilityRole="button" accessibilityLabel={`Disconnect ${account.label}`} onPress={() => void disconnect(account.id)} style={{ alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }}>
              <T style={[type.metaLabel, { color: colors.fg }]}>Disconnect</T>
            </PressableScale>
          </View>
        ))}
        {plugin.auth === "password" ? (
          <View style={{ gap: 8 }}>
            <Field label="Mailbox address" value={email} onChangeText={setEmail} />
            <Field label="Mailbox password" value={password} onChangeText={setPassword} secure />
          </View>
        ) : null}
        {plugin.auth === "token" ? <Field label="Token" value={token} onChangeText={setToken} secure /> : null}
        {plugin.auth === "url" ? (
          <View style={{ gap: 8 }}>
            <Field label="MCP URL" value={url} onChangeText={setUrl} />
            <Field label="Bearer token" value={token} onChangeText={setToken} secure />
          </View>
        ) : null}
        {plugin.wired && plugin.auth !== "local" ? (
          <PressableScale accessibilityRole="button" accessibilityLabel={accounts.length ? `Add account ${plugin.name}` : `Connect ${plugin.name}`} disabled={busy} onPress={() => void connect()} style={{ height: 48, borderRadius: 14, backgroundColor: colors.fg, alignItems: "center", justifyContent: "center" }}>
            <T style={[type.ctaLabel, { color: colors.bg }]}>{busy ? "Working…" : accounts.length ? "Add account" : "Connect"}</T>
          </PressableScale>
        ) : (
          <View style={{ height: 48, borderRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
            <T style={[type.ctaLabel, { color: colors.muted }]}>{plugin.auth === "local" ? "Attach a file in a chat" : "Coming soon"}</T>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Field({ label, value, onChangeText, secure = false }: { label: string; value: string; onChangeText: (value: string) => void; secure?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <T style={[type.metaLabel, { color: colors.muted }]}>{label}</T>
      <TextInput value={value} onChangeText={onChangeText} secureTextEntry={secure} autoCapitalize="none" accessibilityLabel={label} placeholderTextColor={colors.dim} style={{ height: 48, borderRadius: 12, backgroundColor: colors.surfaceInput, borderWidth: 1, borderColor: colors.lineCard, color: colors.fg, paddingHorizontal: 12 }} />
    </View>
  );
}
