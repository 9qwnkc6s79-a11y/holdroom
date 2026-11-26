import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { DraftFile, RoutineEdits } from "@/api/types";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EmailDraftCard } from "@/components/EmailDraftCard";
import { Screen, StatusLine, T } from "@/components/chrome";
import { ChatComposer, type PickedFile } from "@/components/ChatComposer";
import { IconBack, IconClose, IconDots } from "@/components/icons";
import { MessageBubble } from "@/components/MessageBubble";
import { PressableScale } from "@/components/PressableScale";
import { ShapeAvatar, shapeFor } from "@/components/ShapeAvatar";
import { agentLabel, formatWhen, oneParam, startersForAgent, threadUnread } from "@/lib/derive";
import { hapticRigid, hapticSuccess } from "@/lib/haptics";
import { markSeen } from "@/lib/seen";
import { useHatch } from "@/state/hatch";
import { useRequireSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

export default function ChatScreen() {
  useRequireSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ agentId: string; thread?: string; preview?: string; attach?: string; dictate?: string; said?: string }>();
  const agentId = oneParam(params.agentId) || "";
  const threadId = oneParam(params.thread);
  const { agents, threads, turns, messagesFor, phaseFor, send, decide, actOnEmailDraft, prepareAttachment, startThread, archiveThread } = useHatch();
  const agent = agents.find((item) => item.id === agentId) || agents[0];
  const messages = messagesFor(agent?.id || agentId, threadId);
  const phase = phaseFor(agent?.id || agentId);
  const [draft, setDraft] = useState(oneParam(params.said) || "");
  const [files, setFiles] = useState<DraftFile[]>(() =>
    oneParam(params.preview) === "1"
      ? [{ id: "preview", name: "IMG_2067.png", uri: "/demo-photo.png", mimeType: "image/jpeg", kind: "Image", note: "On your firm’s host" }]
      : [],
  );
  const [actionError, setActionError] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [menu, setMenu] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const stickRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const programScrollUntilRef = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!threadId) return;
    void markSeen(threadId).then(setSeen);
  }, [threadId]);
  const unreadOthers = threads.filter((thread) => thread.id !== threadId && threadUnread(thread, seen)).length;
  const activity = useMemo(() => {
    const live = turns[agent?.id || ""];
    if (phase === "thinking" || phase === "listening" || phase === "speaking") {
      return { color: colors.blueSky, text: live?.status || "Thinking…" };
    }
    if (messages.some((message) => message.approval?.status === "pending")) {
      return { color: colors.amber, text: "Needs your approval" };
    }
    return null;
  }, [agent?.id, messages, phase, turns]);
  const agentIndex = Math.max(0, agents.findIndex((item) => item.id === agent?.id));
  const starters = useMemo(() => startersForAgent(agent), [agent]);
  const agentThreads = useMemo(
    () => threads.filter((item) => item.agentId === (agent?.id || agentId) && !item.archived).slice(0, 6),
    [agent?.id, agentId, threads],
  );
  useEffect(() => {
    stickRef.current = true;
    setShowJump(false);
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        programScrollUntilRef.current = Date.now() + 160;
        scrollRef.current?.scrollToEnd({ animated: false });
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [agentId, threadId]);

  const lastMessage = messages[messages.length - 1];
  const contentScrollKey = `${messages.length}:${lastMessage?.id || ""}:${lastMessage?.text?.length || 0}:${lastMessage?.emailDraft?.id || ""}:${lastMessage?.approval?.id || ""}`;

  useEffect(() => {
    if (!stickRef.current || messages.length === 0) return;
    const timer = setTimeout(() => {
      programScrollUntilRef.current = Date.now() + 160;
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [contentScrollKey]);

  async function startFresh(id: string) {
    const created = await startThread(id);
    router.replace(created ? `/chat/${id}?thread=${encodeURIComponent(created)}` : `/chat/${id}`);
  }

  async function pick(file: PickedFile) {
    if (!agent) return;
    const id = `pending-${Date.now()}`;
    const placeholder: DraftFile = { id, name: file.name, uri: file.uri, mimeType: file.mimeType, kind: "Image", reading: true, note: "Preparing…" };
    setFiles((current) => [...current, placeholder]);
    const ready = await prepareAttachment({ ...file, id }, agent.writeDepartmentId, (patch) => {
      setFiles((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    });
    setFiles((current) => current.map((item) => (item.id === id ? ready : item)));
  }

  function submit(text = draft) {
    if (!agent) return;
    const attachments = files.filter((file) => !file.reading && !file.error);
    if (files.some((file) => file.reading)) return;
    if (!text.trim() && attachments.length === 0) return;
    stickRef.current = true;
    setShowJump(false);
    setDraft("");
    setFiles([]);
    void send({ agentId: agent.id, threadId, text, attachments });
  }

  async function onDecision(messageId: string, decision: "approved" | "cancelled", edits?: RoutineEdits) {
    const owning =
      threadId ||
      turns[agent?.id || ""]?.threadId ||
      threads.find((item) => item.messages.some((message) => message.id === messageId))?.id;
    if (!owning) return;
    if (decision === "approved") void hapticSuccess();
    else void hapticRigid();
    setDeciding(true);
    const error = await decide({ threadId: owning, messageId, decision, edits });
    setDeciding(false);
    setActionError(error || "");
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PressableScale accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/bots"))} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
            <IconBack size={18} color={colors.fg} />
            {unreadOthers > 0 ? (
              <View style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.blueButton, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                <T style={{ color: colors.white, fontSize: 10, fontWeight: "700" }}>{unreadOthers}</T>
              </View>
            ) : null}
          </PressableScale>
          <View style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 }}>
            <ShapeAvatar name={agent ? agentLabel(agent) : "Assistant"} shape={shapeFor(agentIndex)} size={24} />
            <T style={[type.headerBrand, { color: colors.fg, flexShrink: 1 }]} numberOfLines={1}>
              {agent ? agentLabel(agent) : "Assistant"}
            </T>
          </View>
          <PressableScale accessibilityRole="button" accessibilityLabel="Chat menu" onPress={() => setMenu(true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
            <IconDots size={18} color={colors.fg} />
          </PressableScale>
        </View>
        <ScrollView
          ref={scrollRef}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const dist = contentSize.height - contentOffset.y - layoutMeasurement.height;
            const prevY = lastScrollYRef.current;
            lastScrollYRef.current = contentOffset.y;
            if (Date.now() < programScrollUntilRef.current) return;
            if (contentOffset.y < prevY - 2) {
              stickRef.current = false;
              setShowJump(dist > 56);
              return;
            }
            const nearBottom = dist < 56;
            stickRef.current = nearBottom;
            setShowJump(!nearBottom);
          }}
          onContentSizeChange={() => {
            if (stickRef.current && messages.length > 0) {
              programScrollUntilRef.current = Date.now() + 140;
              scrollRef.current?.scrollToEnd({ animated: false });
            }
          }}
          contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32, paddingHorizontal: 12 }}>
              <ShapeAvatar name={agent ? agentLabel(agent) : "Hatch"} shape={shapeFor(agentIndex)} size={56} />
              <T style={[type.signInTitle, { color: colors.fg, textAlign: "center", marginTop: 16 }]}>
                Hi — I’m {agent ? agentLabel(agent) : "Hatch"}
              </T>
              <T style={[type.cardSubcopy, { color: colors.muted, textAlign: "center", marginTop: 6, maxWidth: 300 }]}>
                {agent?.description || "Ask a question, search connected mail and Drive, or draft a memo. Nothing leaves your host until you approve."}
              </T>
              <View style={{ marginTop: 18, gap: 8, alignSelf: "stretch", maxWidth: 340, alignItems: "center" }}>
                {starters.map((starter) => (
                  <PressableScale
                    key={starter}
                    accessibilityRole="button"
                    accessibilityLabel={starter}
                    onPress={() => submit(starter)}
                    style={{
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.surface,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                    }}
                  >
                    <T style={[type.cardSubcopy, { color: colors.fg, textAlign: "center" }]}>{starter}</T>
                  </PressableScale>
                ))}
              </View>
            </View>
          ) : (
            messages.map((message) => (
              <View key={message.id} style={{ gap: 12 }}>
                <MessageBubble message={message} onRetry={message.retryQuery ? () => submit(message.retryQuery || "") : undefined} />
                {message.approval ? (
                  <ApprovalCard
                    approval={message.approval}
                    busy={deciding}
                    onApprove={(edits) => void onDecision(message.id, "approved", edits)}
                    onDeny={() => void onDecision(message.id, "cancelled")}
                  />
                ) : null}
                {message.emailDraft ? (
                  <EmailDraftCard
                    draft={message.emailDraft}
                    onAction={(action, fields) => {
                      const owning =
                        threadId ||
                        turns[agent?.id || ""]?.threadId ||
                        threads.find((item) => item.messages.some((m) => m.id === message.id))?.id;
                      return actOnEmailDraft({
                        threadId: owning,
                        messageId: message.id,
                        action,
                        to: fields.to,
                        subject: fields.subject,
                        body: fields.body,
                        draft: message.emailDraft,
                      });
                    }}
                  />
                ) : null}
              </View>
            ))
          )}
          {actionError ? <T style={[type.cardSubcopy, { color: colors.fg }]}>{actionError}</T> : null}
        </ScrollView>
        {showJump ? (
          <View style={{ alignItems: "center", paddingBottom: 6 }}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Jump to latest"
              onPress={() => {
                stickRef.current = true;
                setShowJump(false);
                programScrollUntilRef.current = Date.now() + 160;
                scrollRef.current?.scrollToEnd({ animated: true });
              }}
              style={{
                backgroundColor: colors.blueButton,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
              }}
            >
              <T style={[type.metaLabel, { color: colors.white, fontWeight: "600" }]}>Jump to latest ↓</T>
            </PressableScale>
          </View>
        ) : null}
                {activity ? (
          <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 2 }}>
            <StatusLine color={activity.color} text={activity.text} />
          </View>
        ) : null}
        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          placeholder={agent ? `Ask ${agentLabel(agent)}` : "Ask Hatch"}
          attachments={files}
          onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
          onPick={(file) => void pick(file)}
          onSend={() => submit()}
          sheetOpen={oneParam(params.attach) === "1"}
          recordingPreview={oneParam(params.dictate) === "1"}
          onVoice={() => {
            if (!agent) return;
            const threadQuery = threadId ? `&thread=${encodeURIComponent(threadId)}` : "";
            router.push(`/voice?agent=${encodeURIComponent(agent.id)}${threadQuery}`);
          }}
        />
      </KeyboardAvoidingView>
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel="Close chat menu" onPress={() => setMenu(false)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
          <View style={{ backgroundColor: "#131316", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 8 }}>
              <PressableScale accessibilityRole="button" accessibilityLabel="Close" onPress={() => setMenu(false)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <IconClose size={18} color={colors.fg} />
              </PressableScale>
              <T style={[type.headerBrand, { color: colors.fg, flex: 1, textAlign: "center" }]}>{agent ? agentLabel(agent) : "Chat"}</T>
              <View style={{ width: 44 }} />
            </View>
            <MenuRow label="Library" detail="Search firm files, drafts, and synced apps" onPress={() => { setMenu(false); router.push("/library"); }} />
            <MenuRow label="Connect apps" detail="Gmail, Drive, Slack, Notion, and more" onPress={() => { setMenu(false); router.push("/plugins"); }} />
            <MenuRow label="Bot settings" detail="Model & Ethics, permissions, and the firm host" onPress={() => { setMenu(false); router.push("/profile"); }} />
            <MenuRow label="Fresh chat" detail="Starts a new thread. The host keeps this one." onPress={() => { setMenu(false); if (agent) void startFresh(agent.id); }} />
            {agentThreads.length > 0 ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 6 }}>
                <T style={[type.metaLabel, { color: colors.dim }]}>RECENT THREADS</T>
                {agentThreads.map((item) => {
                  const active = item.id === threadId || (!threadId && item.id === agentThreads[0]?.id);
                  return (
                    <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel={item.title || "Thread"}
                        onPress={() => {
                          setMenu(false);
                          router.replace(`/chat/${agent?.id || agentId}?thread=${encodeURIComponent(item.id)}`);
                        }}
                        style={{ flex: 1, paddingVertical: 8 }}
                      >
                        <T style={[type.cardSubcopy, { color: active ? colors.blueSky : colors.fg }]} numberOfLines={1}>
                          {item.title || "Conversation"} · {formatWhen(item.updatedAt)}
                        </T>
                      </PressableScale>
                      <PressableScale
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${item.title || "thread"}`}
                        onPress={() => {
                          void archiveThread(item.id);
                          if (item.id === threadId && agent) {
                            setMenu(false);
                            router.replace(`/chat/${agent.id}`);
                          }
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 6 }}
                      >
                        <T style={[type.metaLabel, { color: colors.muted }]}>Delete</T>
                      </PressableScale>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function MenuRow({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
      <T style={[type.rowTitle, { color: colors.fg }]}>{label}</T>
      <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>{detail}</T>
    </PressableScale>
  );
}
