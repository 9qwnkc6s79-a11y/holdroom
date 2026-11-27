import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import type { EmailDraftCard as EmailDraft } from "@/api/types";
import { T } from "@/components/chrome";
import { PressableScale } from "@/components/PressableScale";
import { colors, type } from "@/theme/presenceTokens";

export function EmailDraftCard({
  draft,
  onAction,
}: {
  draft: EmailDraft;
  onAction: (action: "send" | "save_draft" | "discard", fields: { to: string; subject: string; body: string }) => Promise<string | null>;
}) {
  const [to, setTo] = useState(draft.to || "");
  const [subject, setSubject] = useState(draft.subject || "");
  const [body, setBody] = useState(draft.body || "");
  const [busy, setBusy] = useState<"send" | "save_draft" | "discard" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setTo(draft.to || "");
    setSubject(draft.subject || "");
    setBody(draft.body || "");
  }, [draft.id, draft.to, draft.subject, draft.body]);

  const editable = draft.status === "draft";

  async function run(action: "send" | "save_draft" | "discard") {
    if (busy) return;
    setBusy(action);
    setError("");
    const err = await onAction(action, { to, subject, body });
    setBusy(null);
    if (err) setError(err);
  }

  return (
    <View
      style={{
        backgroundColor: colors.surfaceInput,
        borderWidth: 1,
        borderColor: colors.lineCard,
        borderRadius: 16,
        padding: 15,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <T style={[type.cardHeading, { color: colors.fg }]}>Email draft</T>
        {draft.accountEmail ? (
          <T style={[type.timestamp, { color: colors.muted }]} numberOfLines={1}>
            via {draft.accountEmail}
          </T>
        ) : null}
      </View>

      <View style={{ gap: 4 }}>
        <T style={[type.timestamp, { color: colors.muted }]}>To</T>
        <TextInput
          value={to}
          onChangeText={setTo}
          editable={editable && !busy}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="recipient@example.com"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.progressTrack,
            borderWidth: 1,
            borderColor: colors.lineProgress,
            borderRadius: 10,
            paddingHorizontal: 11,
            paddingVertical: 8,
            color: colors.fg,
            fontSize: 14,
          }}
        />
      </View>

      <View style={{ gap: 4 }}>
        <T style={[type.timestamp, { color: colors.muted }]}>Subject</T>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          editable={editable && !busy}
          placeholder="Subject"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.progressTrack,
            borderWidth: 1,
            borderColor: colors.lineProgress,
            borderRadius: 10,
            paddingHorizontal: 11,
            paddingVertical: 8,
            color: colors.fg,
            fontSize: 14,
          }}
        />
      </View>

      <View style={{ gap: 4 }}>
        <T style={[type.timestamp, { color: colors.muted }]}>Message</T>
        <TextInput
          value={body}
          onChangeText={setBody}
          editable={editable && !busy}
          multiline
          textAlignVertical="top"
          style={{
            backgroundColor: colors.progressTrack,
            borderWidth: 1,
            borderColor: colors.lineProgress,
            borderRadius: 10,
            paddingHorizontal: 11,
            paddingVertical: 9,
            color: colors.fg,
            fontSize: 14,
            minHeight: 110,
          }}
        />
      </View>

      {error ? <T style={[type.cardSubcopy, { color: colors.amberSoft }]}>{error}</T> : null}

      {editable ? (
        <View style={{ gap: 8, marginTop: 2 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PressableScale
              onPress={() => void run("discard")}
              disabled={Boolean(busy)}
              accessibilityRole="button"
              accessibilityLabel="Discard"
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.denyBg,
                borderWidth: 1,
                borderColor: colors.lineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T style={[type.body, { color: colors.fg, fontWeight: "600" }]}>{busy === "discard" ? "Discarding…" : "Discard"}</T>
            </PressableScale>
            <PressableScale
              onPress={() => void run("send")}
              disabled={Boolean(busy) || !to.trim() || !body.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={{
                flex: 1.25,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.blueButton,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy || !to.trim() || !body.trim() ? 0.6 : 1,
              }}
            >
              <T style={[type.body, { color: colors.white, fontWeight: "600" }]}>{busy === "send" ? "Sending…" : "Send"}</T>
            </PressableScale>
          </View>
          <PressableScale
            onPress={() => void run("save_draft")}
            disabled={Boolean(busy) || !body.trim()}
            accessibilityRole="button"
            accessibilityLabel="Save as Gmail draft"
            style={{
              height: 42,
              borderRadius: 12,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.lineStrong,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy || !body.trim() ? 0.6 : 1,
            }}
          >
            <T style={[type.cardSubcopy, { color: colors.fg, fontWeight: "600" }]}>
              {busy === "save_draft" ? "Saving draft…" : "Save as Gmail draft"}
            </T>
          </PressableScale>
        </View>
      ) : (
        <T style={[type.cardSubcopy, { color: colors.muted }]}>
          {draft.statusNote || (draft.status === "sent" ? "Email sent." : draft.status === "saved" ? "Saved to Gmail drafts." : "Draft discarded.")}
        </T>
      )}
    </View>
  );
}
