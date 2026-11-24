import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { EmptyNote, Screen, StatusLine, T, uiFont } from "@/components/chrome";
import { HatchMark, IconLock, IconMic } from "@/components/icons";
import { PresenceSphere } from "@/components/PresenceSphere";
import { TaskCard } from "@/components/TaskCard";
import { greeting, tasksFromThreads } from "@/lib/derive";
import { hapticLight, hapticSelection } from "@/lib/haptics";
import { useHatch } from "@/state/hatch";
import { colors, type } from "@/theme/presenceTokens";

export default function HomeScreen() {
  const router = useRouter();
  const { agents, threads, hostError, sphere, turns, send } = useHatch();
  const [draft, setDraft] = useState("");
  const tasks = tasksFromThreads(threads, agents);
  const live = Object.values(turns).find((turn) => turn.phase === "thinking" || turn.phase === "listening" || turn.phase === "speaking");
  const status = live?.status || (hostError ? "Your firm’s host is offline" : "Ready for you");
  const dot = colors.blueSky;
  const agent = agents[0];

  function openVoice() {
    void hapticLight();
    router.push(agent ? `/voice?agent=${encodeURIComponent(agent.id)}` : "/voice");
  }

  function ask() {
    const text = draft.trim();
    if (!text || !agent) return;
    setDraft("");
    const latest = threads
      .filter((thread) => thread.agentId === agent.id && !thread.archived)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    void send({ agentId: agent.id, threadId: latest?.id, text });
    router.push(latest ? `/chat/${agent.id}?thread=${encodeURIComponent(latest.id)}` : `/chat/${agent.id}`);
  }

  return (
    <Screen bottom={false}>
      <View style={{ paddingTop: 8, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <HatchMark size={22} />
          <T style={[type.headerBrand, { color: colors.fg }]} maxFontSizeMultiplier={1.25}>
            Hatch
          </T>
        </View>
        <Pressable
          onPress={() => {
            void hapticSelection();
            router.push("/settings");
          }}
          accessibilityRole="button"
          accessibilityLabel="Firm vault, private. Opens settings"
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44 }}
        >
          <IconLock size={12} color={colors.muted} />
          <T style={{ fontSize: 12, lineHeight: 16, color: colors.muted }} maxFontSizeMultiplier={1.25}>
            Firm vault · Private
          </T>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", paddingTop: 18, paddingHorizontal: 20, paddingBottom: 10 }}>
          <PresenceSphere preset="home" state={sphere} onPress={openVoice} />
          <View style={{ height: 14 }} />
          <StatusLine color={dot} text={status} centered />
        </View>
        <View style={{ paddingHorizontal: 20 }}>
          <T style={[type.greeting, { color: colors.fg }]}>{greeting(new Date().getHours())}</T>
          <T style={[type.subcopy, { color: colors.muted, marginTop: 6 }]}>Ask anything, or tap the orb to talk.</T>
          <View
            style={{
              marginTop: 16,
              height: 56,
              borderRadius: 16,
              backgroundColor: colors.surfaceInput,
              borderWidth: 1,
              borderColor: colors.lineInput,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 16,
              paddingRight: 8,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask Hatch..."
              placeholderTextColor={colors.fgSecondary}
              onSubmitEditing={ask}
              returnKeyType="send"
              style={[uiFont, type.inputText, { flex: 1, color: colors.fg, padding: 0 }]}
              accessibilityLabel="Ask Hatch"
            />
            <Pressable
              onPress={openVoice}
              accessibilityRole="button"
              accessibilityLabel="Talk to Hatch"
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.micBg, alignItems: "center", justifyContent: "center" }}
            >
              <IconMic size={18} color={colors.blueSoft} />
            </Pressable>
          </View>
          {hostError ? <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 10 }]}>{hostError}</T> : null}
          <Pressable
            onPress={() => router.push("/threads")}
            accessibilityRole="button"
            accessibilityLabel="Your firm’s threads"
            style={{ marginTop: 26, marginBottom: 10, minHeight: 24 }}
          >
            <T style={[type.metaLabel, { color: colors.muted }]}>From your firm’s work</T>
          </Pressable>
          <View style={{ gap: 10 }}>
            {tasks.length === 0 ? (
              <EmptyNote title="Nothing is waiting" body="When your firm’s work needs you, it will show up here." />
            ) : (
              tasks.slice(0, 8).map((task) => (
                <TaskCard
                  key={task.id}
                  title={task.title}
                  meta={task.meta}
                  urgent={task.urgent}
                  onPress={() => {
                    void hapticSelection();
                    const agentId = task.agentId || agent?.id;
                    if (!agentId) return;
                    router.push(`/chat/${agentId}?thread=${encodeURIComponent(task.threadId)}`);
                  }}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
