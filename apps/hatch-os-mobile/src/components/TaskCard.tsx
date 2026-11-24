import { View } from "react-native";
import { T } from "@/components/chrome";
import { IconChevron } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { colors, type } from "@/theme/presenceTokens";

export function TaskCard({
  title,
  meta,
  urgent,
  onPress,
}: {
  title: string;
  meta: string;
  urgent?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        minHeight: 68,
        paddingVertical: 14,
        paddingRight: 15,
        paddingLeft: urgent ? 17 : 15,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      {urgent ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 2.5,
            borderTopRightRadius: 2,
            borderBottomRightRadius: 2,
            backgroundColor: colors.amber,
          }}
        />
      ) : null}
      <View style={{ flex: 1, gap: 3 }}>
        <T style={[type.rowTitle, { color: colors.fg }]}>{title}</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: urgent ? colors.amber : colors.blueSky }} />
          <T style={[type.metaLabel, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
            {meta}
          </T>
        </View>
      </View>
      <IconChevron size={16} color={colors.muted} />
    </PressableScale>
  );
}
