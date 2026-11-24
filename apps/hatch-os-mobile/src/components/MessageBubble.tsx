import { useState } from "react";
import { Pressable, View } from "react-native";
import type { ChatMessage, ToolEvent } from "@/api/types";
import { T } from "@/components/chrome";
import { colors, type } from "@/theme/presenceTokens";

function toolTitle(tool: ToolEvent): string {
  const name = tool.name.replace(/_/g, " ");
  if (/email|mail/.test(tool.name)) return `Mail · ${tool.detail || name}`;
  if (/calendar/.test(tool.name)) return `Calendar · ${tool.detail || name}`;
  if (/file|drive|read/.test(tool.name)) return `Files · ${tool.detail || name}`;
  return tool.detail || name;
}

function ToolCard({ tool }: { tool: ToolEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={toolTitle(tool)}
      onPress={() => setOpen((value) => !value)}
      style={{ alignSelf: "stretch", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, paddingHorizontal: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.avatarBg, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tool.ok ? colors.blueSky : colors.amber }} />
        </View>
        <T style={[type.metaLabel, { color: colors.fg, flex: 1 }]} numberOfLines={open ? 4 : 1}>
          {toolTitle(tool)}
        </T>
      </View>
      {open && tool.detail ? <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 8 }]}>{tool.detail}</T> : null}
    </Pressable>
  );
}

export function MessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const user = message.role === "user";
  return (
    <View style={{ gap: 8, alignItems: user ? "flex-end" : "flex-start" }}>
      {message.tools?.map((tool, index) => (tool.detail ? <ToolCard key={`${tool.name}-${index}`} tool={tool} /> : null))}
      {message.text ? (
        <View
          style={{
            alignSelf: user ? "flex-end" : "flex-start",
            maxWidth: "85%",
            backgroundColor: user ? colors.blueButton : colors.assistantBubble,
            borderRadius: 18,
            borderBottomRightRadius: user ? 6 : 18,
            borderBottomLeftRadius: user ? 18 : 6,
            paddingVertical: 11,
            paddingHorizontal: 14,
          }}
        >
          <T style={[type.body, { color: user ? colors.white : colors.fg }]}>{message.text}</T>
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
