import { View } from "react-native";
import type { ChatMessage } from "@/api/types";
import { T } from "@/components/chrome";
import { colors, type } from "@/theme/presenceTokens";

export function MessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const user = message.role === "user";
  return (
    <View style={{ gap: 8 }}>
      {message.tools?.map((tool, index) =>
        tool.detail ? (
          <View key={`${tool.name}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blueSky }} />
            <T style={[type.metaLabel, { color: colors.muted, flex: 1 }]}>{tool.detail}</T>
          </View>
        ) : null,
      )}
      {message.text ? (
        <View
          style={{
            alignSelf: user ? "flex-end" : "flex-start",
            maxWidth: "85%",
            backgroundColor: user ? colors.bubbleUser : colors.assistantBubble,
            borderWidth: 1,
            borderColor: user ? colors.lineStrong : colors.line,
            borderRadius: 16,
            borderBottomRightRadius: user ? 5 : 16,
            borderBottomLeftRadius: user ? 16 : 5,
            paddingVertical: 11,
            paddingHorizontal: 14,
          }}
        >
          <T style={[type.body, { color: colors.fg }]}>{message.text}</T>
          {message.attachments?.length ? (
            <T style={[type.metaLabel, { color: colors.muted, marginTop: 6 }]}>
              Attached · {message.attachments.map((file) => file.name).join(", ")}
            </T>
          ) : null}
        </View>
      ) : null}
      {message.failed && onRetry ? (
        <T onPress={onRetry} accessibilityRole="button" style={[type.metaLabel, { color: colors.fgSecondary, paddingHorizontal: 4 }]}>
          Try again
        </T>
      ) : null}
    </View>
  );
}
