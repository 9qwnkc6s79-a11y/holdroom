import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EmptyNote, Screen, T } from "@/components/chrome";
import { IconClose, IconGrid, IconPlus, IconSearch } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { ShapeAvatar, shapeFor } from "@/components/ShapeAvatar";
import { agentLabel, agentRows, formatWhen, initials, oneParam, threadUnread } from "@/lib/derive";
import { hapticLight, hapticSelection } from "@/lib/haptics";
import { loadSeen, markSeen } from "@/lib/seen";
import { useHatch } from "@/state/hatch";
import { useSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

export default function BotsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const { session } = useSession();
  const { agents, threads, turns, startThread } = useHatch();
  const [query, setQuery] = useState(oneParam(params.q) || "");
  useEffect(() => {
    const initial = oneParam(params.q);
    if (initial) setQuery(initial);
  }, [params.q]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const phases = useMemo(() => Object.fromEntries(Object.entries(turns).map(([id, turn]) => [id, turn.phase])), [turns]);
  const rows = agentRows(agents, threads, phases);
  const q = query.trim().toLowerCase();
  const pinned = rows.slice(0, Math.min(2, rows.length)).filter((row) => !q || `${agentLabel(row.agent)} ${row.preview}`.toLowerCase().includes(q));
  const list = useMemo(() => {
    const chats = threads
      .filter((thread) => !thread.archived)
      .map((thread) => {
        const agent = agents.find((item) => item.id === thread.agentId);
        const name = agent ? agentLabel(agent) : thread.title || "Chat";
        const last = [...(thread.messages || [])].reverse().find((message) => message.text.trim());
        return { thread, name, preview: last?.text || thread.title || "No messages yet", agentIndex: Math.max(0, agents.findIndex((item) => item.id === thread.agentId)) };
      })
      .filter((item) => !q || `${item.name} ${item.preview}`.toLowerCase().includes(q));
    const bare = rows
      .filter((row) => !threads.some((thread) => thread.agentId === row.agent.id && !thread.archived))
      .filter((row) => !q || agentLabel(row.agent).toLowerCase().includes(q))
      .filter((row) => q || row.index >= pinned.length)
      .map((row) => ({ thread: undefined, name: agentLabel(row.agent), preview: row.preview, agentIndex: row.index, agentId: row.agent.id }));
    return { chats, bare };
  }, [agents, pinned.length, q, rows, threads]);
  const who = session?.testerLabel || session?.deviceName || "You";
  const empty = agents.length === 0;
  const noMatches = !empty && Boolean(q) && pinned.length === 0 && list.chats.length === 0 && list.bare.length === 0;

  useEffect(() => {
    void loadSeen().then(setSeen);
  }, []);

  async function openChat(agentId: string, threadId?: string) {
    void hapticSelection();
    if (threadId) setSeen(await markSeen(threadId));
    const thread = threadId ? `?thread=${encodeURIComponent(threadId)}` : "";
    router.push(`/chat/${agentId}${thread}`);
  }

  async function fresh(agentId: string) {
    setCreating(false);
    const id = await startThread(agentId);
    await openChat(agentId, id || undefined);
  }

  return (
    <Screen bottom={false}>
      <View style={{ paddingHorizontal: 16, paddingTop: 6, flexDirection: "row", alignItems: "center" }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push("/profile")} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.avatarBg, alignItems: "center", justifyContent: "center" }}>
          <T style={[type.metaLabel, { color: colors.fg }]}>{initials(who)}</T>
        </PressableScale>
        <View style={{ flex: 1 }} />
        <PressableScale accessibilityRole="button" accessibilityLabel="New chat" onPress={() => { void hapticLight(); setCreating(true); }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          <IconPlus size={18} color={colors.fg} />
        </PressableScale>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {pinned.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 18 }}>
            {pinned.map((row) => (
              <PressableScale key={row.agent.id} accessibilityRole="button" accessibilityLabel={agentLabel(row.agent)} onPress={() => void openChat(row.agent.id, row.threadId)} style={{ width: 84, alignItems: "center", gap: 8 }}>
                <View>
                  <ShapeAvatar name={agentLabel(row.agent)} shape={shapeFor(row.index)} size={68} />
                  {row.index === 0 ? (
                    <View style={{ position: "absolute", right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.blueSky, borderWidth: 2, borderColor: colors.bg }} />
                  ) : null}
                </View>
                <T style={[type.metaLabel, { color: colors.fg, textAlign: "center" }]} numberOfLines={1}>
                  {agentLabel(row.agent)}
                </T>
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}
        <View style={{ gap: 4 }}>
          {list.chats.map((item) => {
            const unread = threadUnread(item.thread, seen);
            return (
              <PressableScale key={item.thread.id} accessibilityRole="button" accessibilityLabel={item.name} onPress={() => void openChat(item.thread.agentId || agents[0]?.id || "general", item.thread.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
                <ShapeAvatar name={item.name} shape={shapeFor(item.agentIndex)} size={48} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T style={[type.rowTitle, { color: colors.fg }]} numberOfLines={1}>{item.name}</T>
                  <T style={[type.cardSubcopy, { color: colors.muted }]} numberOfLines={1}>{item.preview}</T>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <T style={[type.timestamp, { color: colors.dim }]}>{formatWhen(item.thread.updatedAt)}</T>
                  {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blueSky }} /> : null}
                </View>
              </PressableScale>
            );
          })}
          {list.bare.map((item) => (
            <PressableScale key={item.agentId} accessibilityRole="button" accessibilityLabel={item.name} onPress={() => void openChat(item.agentId)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
              <ShapeAvatar name={item.name} shape={shapeFor(item.agentIndex)} size={48} />
              <View style={{ flex: 1 }}>
                <T style={[type.rowTitle, { color: colors.fg }]} numberOfLines={1}>{item.name}</T>
                <T style={[type.cardSubcopy, { color: colors.muted }]} numberOfLines={1}>{item.preview}</T>
              </View>
            </PressableScale>
          ))}
          {empty ? <EmptyNote title="No bots yet" body="When your firm’s host has assistants, they show up here." /> : null}
          {noMatches ? <EmptyNote title="No matches" body="Nothing in your bots or chats matches that search." /> : null}
        </View>
      </ScrollView>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 28, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Apps" onPress={() => setAppsOpen(true)} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          <IconGrid size={18} color={colors.fg} />
        </PressableScale>
        <View style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconSearch size={16} color={colors.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search bots and chats"
            style={{ flex: 1, color: colors.fg, fontSize: 16 }}
          />
        </View>
      </View>
      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel="Close new chat" onPress={() => setCreating(false)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
          <View style={{ backgroundColor: "#131316", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28, maxHeight: "70%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 8 }}>
              <PressableScale accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCreating(false)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <IconClose size={18} color={colors.fg} />
              </PressableScale>
              <T style={[type.headerBrand, { color: colors.fg, flex: 1, textAlign: "center" }]}>New chat</T>
              <View style={{ width: 44 }} />
            </View>
            <ScrollView>
              {rows.map((row) => (
                <PressableScale key={row.agent.id} accessibilityRole="button" accessibilityLabel={agentLabel(row.agent)} onPress={() => void fresh(row.agent.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
                  <ShapeAvatar name={agentLabel(row.agent)} shape={shapeFor(row.index)} size={40} />
                  <T style={[type.rowTitle, { color: colors.fg }]}>{agentLabel(row.agent)}</T>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={appsOpen} transparent animationType="slide" onRequestClose={() => setAppsOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel="Close apps" onPress={() => setAppsOpen(false)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
          <View style={{ backgroundColor: "#131316", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 8 }}>
              <PressableScale accessibilityRole="button" accessibilityLabel="Close" onPress={() => setAppsOpen(false)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <IconClose size={18} color={colors.fg} />
              </PressableScale>
              <T style={[type.headerBrand, { color: colors.fg, flex: 1, textAlign: "center" }]}>Apps & Library</T>
              <View style={{ width: 44 }} />
            </View>
            <PressableScale accessibilityRole="button" accessibilityLabel="Library" onPress={() => { setAppsOpen(false); router.push("/library"); }} style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Library</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Firm files, approved drafts, and synced apps</T>
            </PressableScale>
            <PressableScale accessibilityRole="button" accessibilityLabel="Connect apps" onPress={() => { setAppsOpen(false); router.push("/plugins"); }} style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Connect apps</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Gmail, Drive, Slack, Notion, and more</T>
            </PressableScale>
            <PressableScale accessibilityRole="button" accessibilityLabel="Model & Ethics" onPress={() => { setAppsOpen(false); router.push("/ethics"); }} style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Model & Ethics</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Charter, tone, and firm model</T>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
