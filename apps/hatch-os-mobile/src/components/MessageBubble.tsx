import { useEffect, useState } from "react";
import { Image, Modal, Pressable, View } from "react-native";
import { getAuthToken } from "@/api/client";
import type { ChatAttachment, ChatMessage, ToolEvent } from "@/api/types";
import { T } from "@/components/chrome";
import { isWaitStatus } from "@/lib/derive";
import { remoteImageUrl, savedImageUri } from "@/lib/photos";
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

function usePicture(file: ChatAttachment): string {
  const remote = file.fileId && !file.fileId.startsWith("pending") && !file.fileId.startsWith("file-") && !file.fileId.startsWith("local") ? remoteImageUrl(file.fileId) : "";
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (!file.fileId) return;
    void savedImageUri(file.fileId).then((uri) => setSaved(uri || ""));
  }, [file.fileId]);
  return file.previewUri || saved || remote;
}

function Picture({ file }: { file: ChatAttachment }) {
  const uri = usePicture(file);
  const token = getAuthToken();
  const [open, setOpen] = useState(false);
  if (file.kind !== "Image" || !uri) {
    return <T style={[type.metaLabel, { color: colors.muted }]}>{file.name}</T>;
  }
  return (
    <>
      <Pressable accessibilityRole="image" accessibilityLabel={file.name} onPress={() => setOpen(true)}>
        <Image source={uri.startsWith("http") && token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri }} style={{ width: 180, height: 180, borderRadius: 14, backgroundColor: colors.surface }} resizeMode="cover" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close photo" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }}>
          <Image source={uri.startsWith("http") && token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri }} style={{ width: "100%", height: "80%" }} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

export function MessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const user = message.role === "user";
  const text = isWaitStatus(message.text) ? "" : message.text;
  const images = (message.attachments || []).filter((file) => file.kind === "Image");
  const others = (message.attachments || []).filter((file) => file.kind !== "Image");
  return (
    <View style={{ gap: 8, alignItems: user ? "flex-end" : "flex-start" }}>
      {message.tools?.map((tool, index) => (tool.detail ? <ToolCard key={`${tool.name}-${index}`} tool={tool} /> : null))}
      {images.map((file) => (
        <Picture key={file.fileId || file.name} file={file} />
      ))}
      {text ? (
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
          <T style={[type.body, { color: user ? colors.white : colors.fg }]}>{text}</T>
          {others.length ? (
            <T style={[type.metaLabel, { color: user ? colors.blueCore : colors.muted, marginTop: 6 }]}>{others.map((file) => file.name).join(", ")}</T>
          ) : null}
        </View>
      ) : others.length ? (
        <T style={[type.metaLabel, { color: colors.muted }]}>{others.map((file) => file.name).join(", ")}</T>
      ) : null}
      {message.failed && onRetry ? (
        <T onPress={onRetry} accessibilityRole="button" style={[type.metaLabel, { color: colors.fgSecondary, paddingHorizontal: 4 }]}>
          Try again
        </T>
      ) : null}
    </View>
  );
}
