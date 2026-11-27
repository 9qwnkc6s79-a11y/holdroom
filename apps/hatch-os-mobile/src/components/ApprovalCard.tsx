import { useState } from "react";
import { TextInput, View } from "react-native";
import type { ApprovalCard as Approval, RoutineEdits } from "@/api/types";
import { T } from "@/components/chrome";
import { PressableScale } from "@/components/PressableScale";
import { colors, type } from "@/theme/presenceTokens";

const ROUTINE_TOOL = "routine_create";

function field(approval: Approval, label: string) {
  return approval.inputs?.find((input) => input.label === label)?.value || "";
}

function Button({ label, onPress, disabled, primary, flex = 1 }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; flex?: number }) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex,
        height: 46,
        borderRadius: 12,
        backgroundColor: primary ? colors.blueButton : colors.denyBg,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.lineStrong,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <T style={[type.body, { color: primary ? colors.white : colors.fg, fontWeight: "600" }]}>{label}</T>
    </PressableScale>
  );
}

function EditField({ label, value, onChangeText, multiline, hint }: { label: string; value: string; onChangeText: (v: string) => void; multiline?: boolean; hint?: string }) {
  return (
    <View style={{ marginTop: 10 }}>
      <T style={[type.metaLabel, { color: colors.muted }]}>{label}</T>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={colors.dim}
        style={[type.inputText, { color: colors.fg, marginTop: 5, borderWidth: 1, borderColor: colors.lineInput, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: colors.progressTrack, minHeight: multiline ? 72 : undefined, textAlignVertical: multiline ? "top" : "center" }]}
      />
      {hint ? <T style={[type.timestamp, { color: colors.dim, marginTop: 4 }]}>{hint}</T> : null}
    </View>
  );
}

/** Routine proposal: Save / Edit / Cancel. Nothing is saved until Save. */
function RoutineProposal({ approval, busy, onApprove, onDeny }: { approval: Approval; busy?: boolean; onApprove: (edits?: RoutineEdits) => void; onDeny: () => void }) {
  const pending = approval.status === "pending";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(field(approval, "Name"));
  const [when, setWhen] = useState(approval.call?.arguments?.when || field(approval, "When"));
  const [prompt, setPrompt] = useState(approval.call?.arguments?.prompt || field(approval, "Does"));
  const rows = ["When", "Does", "Model"].map((label) => ({ label, value: field(approval, label) })).filter((row) => row.value);
  const note = field(approval, "Note");
  return (
    <View style={{ backgroundColor: colors.surfaceInput, borderWidth: 1, borderColor: colors.lineCard, borderRadius: 16, paddingTop: 15, paddingRight: 16, paddingBottom: 15, paddingLeft: 18 }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 14, bottom: 14, width: 2.5, backgroundColor: colors.blueSky, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blueSky }} />
        <T style={[type.metaLabel, { color: colors.blueSoft, fontWeight: "600" }]}>
          {pending ? "New routine" : approval.status === "approved" ? "Routine saved" : "Not saved"}
        </T>
      </View>
      {editing && pending ? (
        <>
          <EditField label="Name" value={name} onChangeText={setName} />
          <EditField label="When" value={when} onChangeText={setWhen} hint="Plain English: “fridays at 4pm”, “every Monday at 9”." />
          <EditField label="What it does" value={prompt} onChangeText={setPrompt} multiline />
        </>
      ) : (
        <>
          <T style={[type.cardHeading, { color: colors.fg, marginTop: 8 }]}>{field(approval, "Name")}</T>
          <View style={{ marginTop: 10, gap: 6 }}>
            {rows.map((row) => (
              <View key={row.label} style={{ flexDirection: "row", gap: 12 }}>
                <T style={[type.timestamp, { color: colors.muted, width: 48 }]}>{row.label}</T>
                <T style={[type.timestamp, { color: colors.fgSecondary, flex: 1 }]}>{row.value}</T>
              </View>
            ))}
          </View>
          {note && pending ? <T style={[type.timestamp, { color: colors.dim, marginTop: 8 }]}>{note}</T> : null}
          {!pending ? (
            <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 8 }]}>
              {approval.status === "approved" ? "Manage it in Routines." : "No routine was saved."}
            </T>
          ) : null}
        </>
      )}
      {pending ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 13 }}>
          <Button label="Cancel" onPress={onDeny} disabled={busy} />
          {!editing ? <Button label="Edit" onPress={() => setEditing(true)} disabled={busy} /> : null}
          <Button label="Save" primary flex={1.25} disabled={busy} onPress={() => onApprove(editing ? { name, when, prompt } : undefined)} />
        </View>
      ) : null}
    </View>
  );
}

export function ApprovalCard({
  approval,
  busy,
  onApprove,
  onDeny,
}: {
  approval: Approval;
  busy?: boolean;
  onApprove: (edits?: RoutineEdits) => void;
  onDeny: () => void;
}) {
  if (approval.tool === ROUTINE_TOOL) return <RoutineProposal approval={approval} busy={busy} onApprove={onApprove} onDeny={onDeny} />;
  const pending = approval.status === "pending";
  return (
    <View
      style={{
        backgroundColor: colors.surfaceInput,
        borderWidth: 1,
        borderColor: colors.lineCard,
        borderRadius: 16,
        paddingTop: 15,
        paddingRight: 16,
        paddingBottom: 15,
        paddingLeft: 18,
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, top: 14, bottom: 14, width: 2.5, backgroundColor: colors.amber, borderTopRightRadius: 2, borderBottomRightRadius: 2 }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />
        <T style={[type.metaLabel, { color: colors.amberSoft, fontWeight: "600" }]}>
          {pending ? "Needs your approval" : approval.status === "approved" ? "Approved" : "Denied"}
        </T>
      </View>
      <T style={[type.cardHeading, { color: colors.fg, marginTop: 8 }]}>{approval.title}</T>
      {approval.summary ? <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 4 }]}>{approval.summary}</T> : null}
      {approval.inputs?.length ? (
        <View style={{ marginTop: 12, backgroundColor: colors.progressTrack, borderWidth: 1, borderColor: colors.lineProgress, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11, gap: 6 }}>
          {approval.inputs.slice(0, 4).map((input) => (
            <View key={`${input.label}-${input.value}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <T style={[type.timestamp, { color: colors.muted }]}>{input.label}</T>
              <T style={[type.timestamp, { color: colors.fgSecondary, flexShrink: 1, textAlign: "right" }]} numberOfLines={1}>
                {input.value}
              </T>
            </View>
          ))}
        </View>
      ) : null}
      {pending ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 13 }}>
          <Button label="Deny" onPress={onDeny} disabled={busy} />
          <Button label="Approve" primary flex={1.25} onPress={() => onApprove()} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}
