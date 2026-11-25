import { useRef, useState, type ReactNode } from "react";
import { Image, Modal, PanResponder, Pressable, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { DraftFile } from "@/api/types";
import { transcribeClip } from "@/api/client";
import { T, uiFont } from "@/components/chrome";
import { IconArrowUp, IconCamera, IconFiles, IconMic, IconPhoto, IconPlus } from "@/components/icons";
import { HOST_STT_UNAVAILABLE, startListening, type SpeechSession } from "@/lib/speech";
import { composeDictation } from "@/lib/derive";
import { isPhoto } from "@/lib/photos";
import { PressableScale } from "@/components/PressableScale";
import { hapticLight, hapticMedium, hapticRigid } from "@/lib/haptics";
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
  sheetOpen = false,
  recordingPreview = false,
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
  sheetOpen?: boolean;
  recordingPreview?: boolean;
}) {
  const [open, setOpen] = useState(sheetOpen);
  const [listening, setListening] = useState(recordingPreview);
  const [levels, setLevels] = useState<number[]>(() => (recordingPreview ? [0.2, 0.45, 0.7, 0.35, 0.6, 0.25, 0.5, 0.8, 0.4, 0.55, 0.3, 0.65, 0.4, 0.2] : Array(14).fill(0.12)));
  const [pickerError, setPickerError] = useState("");
  const hearing = useRef<SpeechSession | null>(null);
  const heard = useRef("");
  const base = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;
  const busy = attachments.some((file) => file.reading);
  const ready = !busy && (value.trim().length > 0 || attachments.some((file) => !file.error));

  function closeThen(run: () => Promise<void>) {
    setOpen(false);
    setTimeout(() => {
      void run().catch((error: unknown) => {
        setPickerError(error instanceof Error ? error.message : "Could not open that.");
      });
    }, 350);
  }

  async function chooseLibrary() {
    closeThen(async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPickerError("Hatch OS needs photo library access to attach a picture.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, exif: false });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset?.uri) return;
      onPick({ uri: asset.uri, name: asset.fileName || "photo.jpg", mimeType: asset.mimeType || "image/jpeg" });
    });
  }

  async function chooseCamera() {
    closeThen(async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPickerError("Hatch OS needs the camera to take a photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset?.uri) return;
      onPick({ uri: asset.uri, name: asset.fileName || "camera.jpg", mimeType: asset.mimeType || "image/jpeg" });
    });
  }

  async function chooseFile() {
    closeThen(async () => {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      onPick({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || "application/octet-stream" });
    });
  }

  function applyHeard(partial: string) {
    heard.current = partial;
    onChangeText(composeDictation(base.current, partial));
  }

  async function dictate() {
    if (listening) return;
    setPickerError("");
    heard.current = "";
    base.current = valueRef.current.trim();
    void hapticLight();
    const session = await startListening({
      onText: (text) => applyHeard(text),
      onLevel: (level) => setLevels((prev) => [...prev.slice(1), level]),
    });
    if ("error" in session) {
      setPickerError(session.error);
      return;
    }
    hearing.current = session;
    setListening(true);
    if (!session.onDevice) {
      setPickerError("On-device speech isn’t available. Hatch will use your firm’s host when you stop.");
    }
  }

  async function endSession(): Promise<{ onDevice: boolean; clip: string | null }> {
    const session = hearing.current;
    hearing.current = null;
    setListening(false);
    const onDevice = session?.onDevice !== false;
    const clip = (await session?.stop()) || null;
    return { onDevice, clip };
  }

  async function hostText(clip: string | null): Promise<string> {
    if (!clip) return "";
    const server = await transcribeClip({ uri: clip, name: "dictation.wav", mimeType: "audio/wav" });
    if (server.stub || !server.text.trim()) {
      setPickerError(HOST_STT_UNAVAILABLE);
      return "";
    }
    return server.text.trim();
  }

  async function stopRecording() {
    void hapticMedium();
    const { onDevice, clip } = await endSession();
    if (onDevice) return;
    const text = await hostText(clip).catch(() => {
      setPickerError(HOST_STT_UNAVAILABLE);
      return "";
    });
    if (text) applyHeard(text);
    else onChangeText(base.current);
  }

  async function cancelRecording() {
    void hapticRigid();
    await endSession();
    heard.current = "";
    onChangeText(base.current);
  }

  async function sendRecording() {
    void hapticMedium();
    const { onDevice, clip } = await endSession();
    if (!onDevice) {
      const text = await hostText(clip).catch(() => {
        setPickerError(HOST_STT_UNAVAILABLE);
        return "";
      });
      if (!text) {
        onChangeText(base.current);
        return;
      }
      applyHeard(text);
    }
    onSend();
  }

  const actions = useRef({ cancel: () => {}, send: () => {} });
  actions.current = { cancel: () => void cancelRecording(), send: () => void sendRecording() };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 18 || gesture.dy < -18,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx < -72) actions.current.cancel();
        else if (gesture.dy < -48) actions.current.send();
      },
    }),
  ).current;

  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg }}>
      {pickerError ? <T style={[type.cardSubcopy, { color: colors.amberSoft, marginBottom: 8 }]}>{pickerError}</T> : null}
      {attachments.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {attachments.map((file) => {
            const photo = isPhoto(file.name, file.mimeType) || file.kind === "Image";
            return (
              <View key={file.id} style={{ width: photo ? 92 : 180, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: file.error ? colors.amber : colors.line, overflow: "hidden" }}>
                {photo ? <Image source={{ uri: file.uri }} style={{ width: 92, height: 72, backgroundColor: colors.avatarBg }} resizeMode="cover" /> : null}
                <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                  <T style={[type.timestamp, { color: file.error ? colors.amberSoft : colors.muted }]} numberOfLines={2}>
                    {file.reading ? file.note || "Uploading…" : file.error || file.note || file.name}
                  </T>
                </View>
                <Pressable onPress={() => onRemove(file.id)} accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`} hitSlop={8} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                  <T style={{ color: colors.white, fontSize: 14 }}>×</T>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
      {listening ? (
        <View>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Listening…"
            placeholderTextColor={colors.muted}
            multiline
            style={[uiFont, type.inputText, { color: colors.fg, minHeight: 44, maxHeight: 108, marginBottom: 8 }]}
          />
          <T style={[type.metaLabel, { color: colors.muted, textAlign: "center", marginBottom: 6 }]}>^ Swipe up to send</T>
          <View {...pan.panHandlers} style={{ minHeight: 48, borderRadius: 24, backgroundColor: colors.surfaceInput, borderWidth: 1, borderColor: colors.lineCard, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Stop dictation" onPress={() => void stopRecording()} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fg, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.bg }} />
            </Pressable>
            <T style={[type.metaLabel, { color: colors.muted }]} numberOfLines={1}>{"< Swipe left to cancel"}</T>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, height: 22 }}>
              {levels.map((level, index) => (
                <View key={index} style={{ width: 3, height: Math.max(4, Math.round(level * 22)), borderRadius: 2, backgroundColor: colors.blueSky }} />
              ))}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => void sendRecording()} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fg, alignItems: "center", justifyContent: "center" }}>
              <IconArrowUp size={16} color={colors.bg} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ minHeight: 48, maxHeight: 132, borderRadius: 24, backgroundColor: colors.surfaceInput, borderWidth: 1, borderColor: colors.lineCard, paddingLeft: 6, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach a file" hitSlop={6} onPress={() => { void hapticLight(); setPickerError(""); setOpen(true); }} style={{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" }}>
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
          <Pressable accessibilityRole="button" accessibilityLabel="Dictate" hitSlop={6} onPress={() => void dictate()} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
            <IconMic size={18} color={colors.blueSoft} />
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
          <Pressable accessibilityRole="button" accessibilityLabel="Voice mode" hitSlop={6} onPress={() => { void hapticLight(); onVoice(); }} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.micBg }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blueSky }} />
          </Pressable>
        </View>
      )}
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
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: 52, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 14 }}>
      {icon}
      <T style={[type.rowTitle, { color: colors.fg, fontWeight: "500" }]}>{label}</T>
    </PressableScale>
  );
}
