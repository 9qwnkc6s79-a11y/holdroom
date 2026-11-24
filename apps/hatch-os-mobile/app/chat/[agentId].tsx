import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { DraftFile } from "@/api/types";
import { ApprovalCard } from "@/components/ApprovalCard";
import { BackButton, Screen, StatusLine, T } from "@/components/chrome";
import { ChatComposer, type PickedFile } from "@/components/ChatComposer";
import { MessageBubble } from "@/components/MessageBubble";
import { ShapeAvatar, shapeFor } from "@/components/ShapeAvatar";
import { agentLabel, oneParam } from "@/lib/derive";
import { hapticRigid, hapticSuccess } from "@/lib/haptics";
import { useHatch } from "@/state/hatch";
import { useRequireSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

export default function ChatScreen() {
  useRequireSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ agentId: string; thread?: string }>();
  const agentId = oneParam(params.agentId) || "";
  const threadId = oneParam(params.thread);
  const { agents, threads, turns, messagesFor, phaseFor, send, decide, prepareAttachment } = useHatch();
  const agent = agents.find((item) => item.id === agentId) || agents[0];
  const messages = messagesFor(agent?.id || agentId, threadId);
  const phase = phaseFor(agent?.id || agentId);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [actionError, setActionError] = useState("");
  const [deciding, setDeciding] = useState(false);
  const status = useMemo(() => {
    const live = turns[agent?.id || ""];
    if (phase === "thinking" || phase === "listening" || phase === "speaking") {
      return { color: colors.blueSky, text: live?.status || "Thinking…" };
    }
    if (messages.some((message) => message.approval?.status === "pending")) {
      return { color: colors.amber, text: "Needs your approval" };
    }
    return { color: colors.blueSky, text: "Ready for you" };
  }, [agent?.id, messages, phase, turns]);
  const agentIndex = Math.max(0, agents.findIndex((item) => item.id === agent?.id));

  async function pick(file: PickedFile) {
    if (!agent) return;
    const placeholder: DraftFile = { id: `pending-${Date.now()}`, name: file.name, uri: file.uri, mimeType: file.mimeType, kind: "Office", reading: true };
    setFiles((current) => [...current, placeholder]);
    const ready = await prepareAttachment(file, agent.writeDepartmentId);
    setFiles((current) => current.map((item) => (item.id === placeholder.id ? ready : item)));
  }

  function submit(text = draft) {
    if (!agent) return;
    const attachments = files.filter((file) => !file.reading);
    if (!text.trim() && attachments.length === 0) return;
    setDraft("");
    setFiles([]);
    void send({ agentId: agent.id, threadId, text, attachments });
  }

  async function onDecision(messageId: string, decision: "approved" | "cancelled") {
    const owning =
      threadId ||
      turns[agent?.id || ""]?.threadId ||
      threads.find((item) => item.messages.some((message) => message.id === messageId))?.id;
    if (!owning) return;
    if (decision === "approved") void hapticSuccess();
    else void hapticRigid();
    setDeciding(true);
    const error = await decide({ threadId: owning, messageId, decision });
    setDeciding(false);
    setActionError(error || "");
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))} />
          <ShapeAvatar name={agent ? agentLabel(agent) : "Assistant"} shape={shapeFor(agentIndex)} size={34} />
          <View style={{ flex: 1, marginLeft: 4 }}>
            <T style={[type.headerBrand, { color: colors.fg }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>
              {agent ? agentLabel(agent) : "Assistant"}
            </T>
            <View style={{ marginTop: 2 }}>
              <StatusLine color={status.color} text={status.text} />
            </View>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <View style={{ paddingVertical: 24 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>Nothing in this thread yet</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 6 }]}>
                Ask anything. Nothing leaves your firm’s host until you approve.
              </T>
            </View>
          ) : (
            messages.map((message) => (
              <View key={message.id} style={{ gap: 12 }}>
                <MessageBubble message={message} onRetry={message.retryQuery ? () => submit(message.retryQuery || "") : undefined} />
                {message.approval ? (
                  <ApprovalCard
                    approval={message.approval}
                    busy={deciding}
                    onApprove={() => void onDecision(message.id, "approved")}
                    onDeny={() => void onDecision(message.id, "cancelled")}
                  />
                ) : null}
              </View>
            ))
          )}
          {actionError ? <T style={[type.cardSubcopy, { color: colors.fg }]}>{actionError}</T> : null}
        </ScrollView>
        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          placeholder={agent ? `Reply to ${agentLabel(agent)}...` : "Ask Hatch..."}
          attachments={files}
          onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
          onPick={(file) => void pick(file)}
          onSend={() => submit()}
          onVoice={() => {
            if (!agent) return;
            const threadQuery = threadId ? `&thread=${encodeURIComponent(threadId)}` : "";
            router.push(`/voice?agent=${encodeURIComponent(agent.id)}${threadQuery}`);
          }}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
