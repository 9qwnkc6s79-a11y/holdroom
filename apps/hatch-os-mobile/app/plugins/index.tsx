import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { EmptyNote, Screen, T } from "@/components/chrome";
import { IconClose, IconSearch } from "@/components/icons";
import { loadConnectors, type ConnectedAccount, type OAuthSetup } from "@/api/connectors";
import { FOR_YOU, PLUGIN_CATEGORIES, PLUGINS, pluginsIn, type PluginDef } from "@/plugins/catalog";
import { useRequireSession, useSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

function accountsFor(plugin: PluginDef, connected: ConnectedAccount[]) {
  if (!plugin.provider) return [];
  return connected.filter((account) => account.kind === plugin.provider);
}

export default function PluginsScreen() {
  useRequireSession();
  const router = useRouter();
  const { session } = useSession();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof PLUGIN_CATEGORIES)[number]>("All");
  const [connected, setConnected] = useState<ConnectedAccount[]>([]);
  const [setup, setSetup] = useState<OAuthSetup[]>([]);
  const msHidden = setup.some((item) => item.kind === "microsoft" && !item.configured);
  const visible = (item: PluginDef) => !(msHidden && item.provider === "microsoft");
  const shown = pluginsIn(category, query).filter(visible);
  const suggestions = FOR_YOU.map((id) => PLUGINS.find((plugin) => plugin.id === id)).filter((plugin): plugin is PluginDef => Boolean(plugin)).filter(visible);
  const connectedCount = connected.length;

  useEffect(() => {
    const scope = session?.inviteCode;
    if (!scope) return;
    void loadConnectors(scope)
      .then((data) => {
        setConnected(data.connected || []);
        setSetup(data.setup || []);
      })
      .catch(() => setConnected([]));
  }, [session?.inviteCode]);

  return (
    <Screen bottom={false}>
      <View style={{ paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }}>
        <Pressable accessibilityLabel="Close connect apps" onPress={() => (router.canGoBack() ? router.back() : router.replace("/bots"))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconClose size={18} color={colors.fg} />
        </Pressable>
        <T style={[type.headerBrand, { color: colors.fg, flex: 1 }]}>Connect apps</T>
        <View style={{ borderRadius: 99, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6 }}>
          <T style={[type.metaLabel, { color: colors.fg }]}>{connectedCount} connected</T>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {PLUGIN_CATEGORIES.map((item) => {
            const on = item === category;
            return (
              <Pressable key={item} accessibilityLabel={item} onPress={() => setCategory(item)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.fg : colors.surface }}>
                <T style={[type.metaLabel, { color: on ? colors.bg : colors.fg }]}>{item}</T>
              </Pressable>
            );
          })}
        </View>
        {category === "All" && !query.trim() ? (
          <>
            <T style={[type.rowTitle, { color: colors.fg, marginBottom: 8 }]}>For you</T>
            <View style={{ gap: 8, marginBottom: 22 }}>
              {suggestions.map((plugin) => (
                <Pressable key={plugin.id} accessibilityLabel={plugin.name} onPress={() => router.push(`/plugins/${plugin.id}`)} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <T style={[type.rowTitle, { color: colors.fg }]}>{plugin.name}</T>
                    <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>{plugin.reason}</T>
                  </View>
                  <ConnectMark plugin={plugin} count={accountsFor(plugin, connected).length} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        <T style={[type.rowTitle, { color: colors.fg, marginBottom: 8 }]}>{category === "CRM" ? "CRM" : "Featured plugins"}</T>
        {shown.length === 0 ? <EmptyNote title="No plugins" body={category === "CRM" ? "No CRM plugins are on the host." : "Nothing matches that search."} /> : null}
        <View style={{ gap: 8 }}>
          {shown.map((plugin) => {
            const count = accountsFor(plugin, connected).length;
            return (
              <Pressable key={plugin.id} accessibilityLabel={plugin.name} onPress={() => router.push(`/plugins/${plugin.id}`)} style={{ minHeight: 64, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.avatarBg, alignItems: "center", justifyContent: "center" }}>
                  <T style={[type.metaLabel, { color: colors.fg }]}>{plugin.name.slice(0, 1)}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T style={[type.rowTitle, { color: colors.fg }]}>{plugin.name}</T>
                  <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>
                    {count ? `${count} account${count === 1 ? "" : "s"}` : plugin.blurb}
                  </T>
                </View>
                <ConnectMark plugin={plugin} count={count} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 28, height: 48, borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconSearch size={16} color={colors.dim} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search across apps and plugins" placeholderTextColor={colors.muted} accessibilityLabel="Search across apps and plugins" style={{ flex: 1, color: colors.fg, fontSize: 16 }} />
      </View>
    </Screen>
  );
}

function ConnectMark({ plugin, count }: { plugin: PluginDef; count: number }) {
  const label = !plugin.wired ? "Coming soon" : plugin.auth === "local" ? "On this iPhone" : count ? "Connected" : "Connect";
  const quiet = !plugin.wired || count > 0 || plugin.auth === "local";
  return (
    <View style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: quiet ? colors.surfaceRaised : colors.fg }}>
      <T style={[type.metaLabel, { color: quiet ? colors.muted : colors.bg }]}>{label}</T>
    </View>
  );
}
