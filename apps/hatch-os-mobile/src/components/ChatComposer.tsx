import { useState, type ReactNode } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { DraftFile } from "@/api/types";
import { T, uiFont } from "@/components/chrome";
import { IconArrowUp, IconCamera, IconFiles, IconMic, IconPhoto, IconPlus } from "@/components/icons";
import { startListening, type SpeechSession } from "@/lib/speech";
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
  const [listening, setListening] = useState(false);
  const ready = value.trim().length > 0 || attachments.some((file) => !file.reading);

  async function dictate() {
    if (listening) return;
    void hapticLight();
    const session = await startListening({
      onText: (text) => onChangeText(text),
      onLevel: () => undefined,
    });
    if ("error" in session) return;
    setListening(true);
    const handle = session as SpeechSession;
    setTimeout(() => {
      void handle.stop().finally(() => setListening(false));
    }, 8000);
  }

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
      <View style={{ minHeight: 48, maxHeight: 132, borderRadius: 24, backgroundColor: colors.surfaceInput, borderWidth: 1, borderColor: colors.lineCard, paddingLeft: 6, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
          hitSlop={6}
          onPress={() => {
            void hapticLight();
            setOpen(true);
          }}
          style={{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" }}
        >
          <IconPlus size={18} color={colors.muted} strokeWidth={1.8} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          style={[uiFont, type.inputText, { flex: 1, color: colors.fg, paddingVertical: 8, maxHeight: 108, textAlignVertical: "center" }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? "Listening" : "Dictate"}
          hitSlop={6}
          onPress={() => void dictate()}
          style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: listening ? colors.blueButton : "transparent" }}
        >
          <IconMic size={18} color={listening ? colors.white : colors.blueSoft} />
        </Pressable>
        {ready ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            hitSlop={6}
            disabled={sending}
            onPress={() => {
              void hapticMedium();
              onSend();
            }}
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.fg }}
          >
            <IconArrowUp size={16} color={colors.bg} strokeWidth={2} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voice mode"
          hitSlop={6}
          onPress={() => {
            void hapticLight();
            onVoice();
          }}
          style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.micBg }}
        >
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blueSky }} />
        </Pressable>
      </View>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable accessibilityLabel="Close attachments" onPress={() => setOpen(false)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
          <View style={{ backgroundColor: "#131316", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#3F3F46", alignSelf: "center", marginTop: 10, marginBottom: 8 }} />
            <SheetRow icon={<IconPhoto size={18} color="#A1A1AA" />} label="Photo library" onPress={() => void chooseLibrary()} />
            <SheetRow icon={<IconCamera size={18} color="#A1A1AA" />} label="Take photo" onPress={() => void chooseCamera()} />
            <SheetRow icon={<IconFiles size={18} color="#A1A1AA" />} label="Files" onPress={() => void chooseFile()} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SheetRow({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: 52, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 14 }}
    >
      {icon}
      <T style={[type.rowTitle, { color: colors.fg, fontWeight: "500" }]}>{label}</T>
    </PressableScale>
  );
}
