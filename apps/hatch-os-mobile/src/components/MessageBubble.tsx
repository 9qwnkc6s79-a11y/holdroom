import { useEffect, useState } from "react";
import { Image, Linking, Modal, Pressable, View } from "react-native";
import { getAuthToken } from "@/api/client";
import type { ChatAttachment, ChatMessage, Source } from "@/api/types";
import { T } from "@/components/chrome";
import { isWaitStatus } from "@/lib/derive";
import { remoteImageUrl, savedImageUri } from "@/lib/photos";
import { colors, type } from "@/theme/presenceTokens";

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

function LinkedText({ text, color }: { text: string; color: string }) {
  const parts: { label: string; url?: string }[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ label: text.slice(last, m.index) });
    parts.push({ label: m[1], url: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ label: text.slice(last) });
  if (parts.length <= 1 && !parts[0]?.url) {
    return <T style={[type.body, { color }]}>{text}</T>;
  }
  return (
    <T style={[type.body, { color }]}>
      {parts.map((part, idx) =>
        part.url ? (
          <T
            key={idx}
            onPress={() => void Linking.openURL(part.url!)}
            accessibilityRole="link"
            style={{ textDecorationLine: "underline" }}
          >
            {part.label}
          </T>
        ) : (
          part.label
        ),
      )}
    </T>
  );
}

export function MessageBubble({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const user = message.role === "user";
  const text = isWaitStatus(message.text) ? "" : message.text;
  const images = (message.attachments || []).filter((file) => file.kind === "Image");
  const others = (message.attachments || []).filter((file) => file.kind !== "Image");
  const linkedSources = !user
    ? (message.sources || [])
        .filter((src): src is Source & { url: string } => Boolean(src.url && /^https?:\/\//i.test(src.url)))
        .filter((src, idx, arr) => arr.findIndex((x) => x.url === src.url) === idx)
        .slice(0, 4)
    : [];
  if (!text && !images.length && !others.length && !message.failed) return null;
  return (
    <View style={{ gap: 8, alignItems: user ? "flex-end" : "flex-start" }}>
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
          {user ? <T style={[type.body, { color: colors.white }]}>{text}</T> : <LinkedText text={text} color={colors.fg} />}
          {others.length ? (
            <T style={[type.metaLabel, { color: user ? colors.blueCore : colors.muted, marginTop: 6 }]}>{others.map((file) => file.name).join(", ")}</T>
          ) : null}
        </View>
      ) : others.length ? (
        <T style={[type.metaLabel, { color: colors.muted }]}>{others.map((file) => file.name).join(", ")}</T>
      ) : null}
      {linkedSources.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, maxWidth: "85%" }}>
          {linkedSources.map((src, idx) => (
            <Pressable
              key={`${message.id}-src-${idx}`}
              accessibilityRole="link"
              accessibilityLabel={`${src.room}: ${src.file}`}
              onPress={() => void Linking.openURL(src.url)}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.surface,
                paddingHorizontal: 10,
                paddingVertical: 5,
                maxWidth: 260,
              }}
            >
              <T numberOfLines={1} style={[type.metaLabel, { color: colors.fgSecondary }]}>
                {src.room} · {src.file}
              </T>
            </Pressable>
          ))}
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
