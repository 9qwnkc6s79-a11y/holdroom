import { useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { DraftFile } from "@/api/types";
import { T } from "@/components/chrome";
import { IconArrowUp, IconMic, IconPlus } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { colors, type } from "@/theme/presenceTokens";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

export function ChatComposer({
  value,
  onChangeText,
  placeholder,
  attachments,
  onRemove,
  onPick,
  onSend,
  onVoice,
  sending,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  attachments: DraftFile[];
  onRemove: (id: string) => void;
  onPick: (file: PickedFile) => void;
  onSend: () => void;
  onVoice: () => void;
  sending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ready = value.trim().length > 0 || attachments.some((file) => !file.reading);
  const iconButton = {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  async function chooseLibrary() {
    setOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    onPick({ uri: asset.uri, name: asset.fileName || "photo.jpg", mimeType: asset.mimeType || "image/jpeg" });
  }

  async function chooseCamera() {
    setOpen(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    onPick({ uri: asset.uri, name: asset.fileName || "camera.jpg", mimeType: asset.mimeType || "image/jpeg" });
  }

  async function chooseFile() {
    setOpen(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onPick({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || "application/octet-stream" });
  }

  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg }}>
      {attachments.length ? (
        <View style={{ gap: 6, marginBottom: 8 }}>
          {attachments.map((file) => (
            <View key={file.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingVertical: 8, paddingHorizontal: 10 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: file.text ? colors.blueSky : colors.dim }} />
              <View style={{ flex: 1 }}>
                <T style={[type.metaLabel, { color: colors.fg }]} numberOfLines={1}>{file.name}</T>
                <T style={[type.timestamp, { color: colors.muted }]} numberOfLines={2}>
                  {file.reading ? "Reading…" : file.note || (file.text ? "Text ready" : "Attached")}
                </T>
              </View>
              <Pressable onPress={() => onRemove(file.id)} accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`} hitSlop={8}>
                <T style={{ color: colors.muted, fontSize: 16 }}>×</T>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ minHeight: 48, maxHeight: 132, borderRadius: 14, backgroundColor: colors.surfaceInput, borderWidth: 1, borderColor: colors.lineCard, paddingHorizontal: 7, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
          hitSlop={8}
          onPress={() => {
            void hapticLight();
            setOpen(true);
          }}
          style={iconButton}
        >
          <IconPlus size={18} color={colors.muted} strokeWidth={1.8} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          style={[type.inputText, { flex: 1, color: colors.fg, paddingVertical: 12, maxHeight: 120 }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ready ? "Send" : "Voice"}
          hitSlop={8}
          disabled={sending}
          onPress={() => {
            if (ready) {
              void hapticMedium();
              onSend();
            } else {
              void hapticLight();
              onVoice();
            }
          }}
          style={[iconButton, { backgroundColor: ready ? colors.fg : colors.micBg, marginBottom: 7 }]}
        >
          {ready ? <IconArrowUp size={16} color={colors.bg} strokeWidth={2} /> : <IconMic size={18} color={colors.blueSoft} />}
        </Pressable>
      </View>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
          <View style={{ backgroundColor: colors.surfaceInput, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderColor: colors.lineCard, padding: 12, gap: 8 }}>
            <SheetRow label="Photo library" onPress={() => void chooseLibrary()} />
            <SheetRow label="Camera" onPress={() => void chooseCamera()} />
            <SheetRow label="Files" onPress={() => void chooseFile()} />
            <SheetRow label="Cancel" onPress={() => setOpen(false)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function SheetRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: 50, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <T style={[type.rowTitle, { color: colors.fg }]}>{label}</T>
    </PressableScale>
  );
}
