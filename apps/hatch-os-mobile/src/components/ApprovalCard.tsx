import { View } from "react-native";
import type { ApprovalCard as Approval } from "@/api/types";
import { T } from "@/components/chrome";
import { PressableScale } from "@/components/PressableScale";
import { colors, type } from "@/theme/presenceTokens";

export function ApprovalCard({
  approval,
  busy,
  onApprove,
  onDeny,
}: {
  approval: Approval;
  busy?: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
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
          <PressableScale
            onPress={onDeny}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Deny"
            style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.denyBg, borderWidth: 1, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" }}
          >
            <T style={[type.body, { color: colors.fg, fontWeight: "600" }]}>Deny</T>
          </PressableScale>
          <PressableScale
            onPress={onApprove}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Approve"
            style={{ flex: 1.25, height: 46, borderRadius: 12, backgroundColor: colors.blueButton, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}
          >
            <T style={[type.body, { color: colors.white, fontWeight: "600" }]}>Approve</T>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}
