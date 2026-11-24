import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { BackButton, EmptyNote, Screen, SearchField, T, tabular } from "@/components/chrome";
import { IconMic, IconPlus } from "@/components/icons";
import { PresenceSphere } from "@/components/PresenceSphere";
import { PressableScale } from "@/components/PressableScale";
import { formatWhen, snippet } from "@/lib/derive";
import { hapticLight, hapticSelection } from "@/lib/haptics";
import { useHatch } from "@/state/hatch";
import { useRequireSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

export default function ThreadsScreen() {
  useRequireSession();
  const router = useRouter();
  const { agents, threads, send, startThread } = useHatch();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const agent = agents[0];
  const rows = threads
    .filter((thread) => !thread.archived)
    .filter((thread) => `${thread.title} ${(thread.messages || []).map((message) => message.text).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  async function create() {
    if (!agent) {
      setError("Your firm’s host has no assistant to start a thread with yet.");
      return;
    }
    void hapticLight();
    const id = await startThread(agent.id);
    if (!id) {
      setError("Hatch could not start a thread.");
      return;
    }
    router.push(`/chat/${agent.id}?thread=${encodeURIComponent(id)}`);
  }

  function ask() {
    const text = draft.trim();
    if (!text || !agent) return;
    setDraft("");
    void send({ agentId: agent.id, text });
    router.push(`/chat/${agent.id}`);
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: 8, paddingTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))} />
        <PressableScale
          onPress={() => void create()}
          accessibilityRole="button"
          accessibilityLabel="New thread"
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceInput, borderWidth: 1, borderColor: colors.lineCard, alignItems: "center", justifyContent: "center" }}
        >
          <IconPlus size={18} color={colors.blueSoft} />
        </PressableScale>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <T style={[type.pageTitle, { color: colors.fg, marginTop: 8 }]}>Threads</T>
        <T style={[type.subcopy, { color: colors.muted, marginTop: 6, marginBottom: 16 }]}>Your firm’s active and recent conversations.</T>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search threads" />
        <View style={{ gap: 8, marginTop: 12 }}>
          {error ? <T style={[type.cardSubcopy, { color: colors.fg }]}>{error}</T> : null}
          {rows.length === 0 ? (
            <EmptyNote title="No threads yet" body="Start one below. It stays on your firm’s host." />
          ) : (
            rows.map((thread) => {
              const pending = (thread.messages || []).some((message) => message.approval?.status === "pending");
              const assistant = agents.find((item) => item.id === thread.agentId);
              const last = [...(thread.messages || [])].reverse().find((message) => message.text.trim());
              const meta = pending ? `${assistant?.name || "Assistant"} · Needs your approval` : `${assistant?.name || "Assistant"} · ${snippet(last?.text) || "Ready for you"}`;
              return (
                <PressableScale
                  key={thread.id}
                  accessibilityRole="button"
                  onPress={() => {
                    void hapticSelection();
                    const agentId = thread.agentId || agent?.id;
                    if (!agentId) return;
                    router.push(`/chat/${agentId}?thread=${encodeURIComponent(thread.id)}`);
                  }}
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingVertical: 14, paddingRight: 15, paddingLeft: pending ? 17 : 15 }}
                >
                  {pending ? <View style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 2.5, backgroundColor: colors.amber, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} /> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <T style={[type.rowTitle, { color: colors.fg, flex: 1 }]} numberOfLines={1}>
                      {thread.title || "Thread"}
                    </T>
                    <T style={[type.timestamp, tabular, { color: colors.muted }]}>{formatWhen(thread.updatedAt)}</T>
                  </View>
                  {last ? (
                    <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 4 }]} numberOfLines={1}>
                      {snippet(last.text)}
                    </T>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 6 }}>
                    {pending ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} /> : null}
                    <T style={[type.metaLabel, { color: pending ? colors.amberSoft : colors.muted, flex: 1 }]} numberOfLines={1}>
                      {meta}
                    </T>
                  </View>
                </PressableScale>
              );
            })
          )}
        </View>
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <PresenceSphere preset="threads" state="idle" />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Start a new thread..."
          placeholderTextColor={colors.muted}
          onSubmitEditing={ask}
          style={[type.inputText, { flex: 1, color: colors.fg, minHeight: 44 }]}
          accessibilityLabel="Start a new thread"
        />
        <PressableScale
          onPress={() => {
            if (draft.trim()) ask();
            else {
              void hapticLight();
              router.push(agent ? `/voice?agent=${encodeURIComponent(agent.id)}` : "/voice");
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={draft.trim() ? "Send" : "Voice"}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: draft.trim() ? colors.fg : colors.micBg, alignItems: "center", justifyContent: "center" }}
        >
          {draft.trim() ? <T style={{ color: colors.bg, fontWeight: "700" }}>↑</T> : <IconMic size={18} color={colors.blueSoft} />}
        </PressableScale>
      </View>
    </Screen>
  );
}
