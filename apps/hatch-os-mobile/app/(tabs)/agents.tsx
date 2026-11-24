import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { EmptyNote, Screen, SearchField, T, tabular } from "@/components/chrome";
import { roleIcon } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { ShapeAvatar, shapeFor } from "@/components/ShapeAvatar";
import { agentLabel, agentRows, formatWhen } from "@/lib/derive";
import { hapticSelection } from "@/lib/haptics";
import { useHatch } from "@/state/hatch";
import { colors, type } from "@/theme/presenceTokens";

export default function AgentsScreen() {
  const router = useRouter();
  const { agents, threads, turns } = useHatch();
  const [query, setQuery] = useState("");
  const phases = useMemo(() => Object.fromEntries(Object.entries(turns).map(([id, turn]) => [id, turn.phase])), [turns]);
  const rows = agentRows(agents, threads, phases).filter((row) => {
    const hay = `${agentLabel(row.agent)} ${row.preview}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <Screen bottom={false}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <T style={[type.pageTitle, { color: colors.fg }]}>Agents</T>
        <T style={[type.subcopy, { color: colors.muted, marginTop: 6, marginBottom: 16 }]}>Tap an agent to talk or review work.</T>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search agents" />
        <View style={{ gap: 8, marginTop: 12 }}>
          {rows.length === 0 ? (
            <EmptyNote title="No assistants yet" body="When your firm’s host has assistants, they will show up here." />
          ) : (
            rows.map((row) => (
              <PressableScale
                key={row.agent.id}
                accessibilityRole="button"
                accessibilityLabel={agentLabel(row.agent)}
                onPress={() => {
                  void hapticSelection();
                  const thread = row.threadId ? `?thread=${encodeURIComponent(row.threadId)}` : "";
                  router.push(`/chat/${row.agent.id}${thread}`);
                }}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 16,
                  paddingVertical: 12,
                  paddingRight: 14,
                  paddingLeft: row.status?.tone === "amber" ? 16 : 12,
                  flexDirection: "row",
                  gap: 12,
                }}
              >
                {row.status?.tone === "amber" ? (
                  <View style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 2.5, backgroundColor: colors.amber, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />
                ) : null}
                <ShapeAvatar name={agentLabel(row.agent)} shape={shapeFor(row.index)} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <T style={[type.rowTitle, { color: colors.fg }]} numberOfLines={1}>
                      {agentLabel(row.agent)}
                    </T>
                    <View style={{ marginLeft: 6 }}>{roleIcon(row.agent.icon, { size: 13, color: colors.dim })}</View>
                    {row.when ? (
                      <T style={[type.timestamp, tabular, { color: colors.muted, marginLeft: "auto" }]}>{formatWhen(row.when)}</T>
                    ) : null}
                  </View>
                  <T style={[type.cardSubcopy, { color: colors.muted }]} numberOfLines={1}>
                    {row.preview}
                  </T>
                  {row.status ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 2 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: row.status.tone === "amber" ? colors.amber : colors.blueSky }} />
                      <T style={[type.metaLabel, { color: row.status.tone === "amber" ? colors.amberSoft : colors.muted }]}>{row.status.label}</T>
                    </View>
                  ) : null}
                </View>
              </PressableScale>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
