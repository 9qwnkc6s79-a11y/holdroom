import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { listLibrary, readFileText } from "@/api/client";
import type { HatchFile, LibraryPassage } from "@/api/types";
import { EmptyNote, Screen, T } from "@/components/chrome";
import { IconClose, IconSearch } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { workspaceName } from "@/lib/derive";
import { useRequireSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

export default function LibraryScreen() {
  useRequireSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<HatchFile[]>([]);
  const [passages, setPassages] = useState<LibraryPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ title: string; meta: string; text: string } | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await listLibrary(q);
      setFiles(data.files);
      setPassages(data.passages);
    } catch {
      setFiles([]);
      setPassages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(query);
    }, query ? 150 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function openFile(file: HatchFile) {
    setOpen({
      title: file.name,
      meta: `${workspaceName(file.departmentId) || file.departmentId} · ${file.kind}`,
      text: "Loading…",
    });
    try {
      const text = await readFileText(file.id);
      setOpen({
        title: file.name,
        meta: `${workspaceName(file.departmentId) || file.departmentId} · ${file.kind}`,
        text: text || "No extracted text available.",
      });
    } catch {
      setOpen({
        title: file.name,
        meta: `${workspaceName(file.departmentId) || file.departmentId} · ${file.kind}`,
        text: "Could not load this file from your firm’s host.",
      });
    }
  }

  return (
    <Screen bottom={false}>
      <View style={{ paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Close library" onPress={() => (router.canGoBack() ? router.back() : router.replace("/bots"))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconClose size={18} color={colors.fg} />
        </PressableScale>
        <T style={[type.headerBrand, { color: colors.fg, flex: 1 }]}>Library</T>
        <View style={{ borderRadius: 99, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6 }}>
          <T style={[type.metaLabel, { color: colors.fg }]}>{files.length + passages.length} items</T>
        </View>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(query)} tintColor={colors.fg} />} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {loading && !files.length && !passages.length ? (
          <EmptyNote title="Loading Library" body="Checking firm files and synced apps…" />
        ) : null}
        {!loading && !files.length && !passages.length ? (
          <EmptyNote title="Nothing here yet" body={query ? "No firm files or synced items matched that search." : "Connect an app or add firm files to browse them here."} />
        ) : null}
        {passages.length > 0 ? (
          <View style={{ marginTop: 10, marginBottom: 18 }}>
            <T style={[type.metaLabel, { color: colors.dim, marginBottom: 8, marginLeft: 4 }]}>SYNCED APPS</T>
            <View style={{ gap: 8 }}>
              {passages.map((passage) => (
                <PressableScale
                  key={passage.id}
                  accessibilityRole="button"
                  accessibilityLabel={passage.title}
                  onPress={() => setOpen({ title: passage.title, meta: passage.source, text: passage.text })}
                  style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14 }}
                >
                  <T style={[type.rowTitle, { color: colors.fg }]} numberOfLines={1}>{passage.title}</T>
                  <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>{passage.source}</T>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}
        {files.length > 0 ? (
          <View style={{ marginTop: 4 }}>
            <T style={[type.metaLabel, { color: colors.dim, marginBottom: 8, marginLeft: 4 }]}>FIRM FILE ROOM</T>
            <View style={{ gap: 8 }}>
              {files.map((file) => (
                <PressableScale
                  key={file.id}
                  accessibilityRole="button"
                  accessibilityLabel={file.name}
                  onPress={() => void openFile(file)}
                  style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14 }}
                >
                  <T style={[type.rowTitle, { color: colors.fg }]} numberOfLines={1}>{file.name}</T>
                  <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>
                    {workspaceName(file.departmentId) || file.departmentId} · {file.kind}
                  </T>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 28, height: 48, borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconSearch size={16} color={colors.dim} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Library"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Search Library"
          style={{ flex: 1, color: colors.fg, fontSize: 16 }}
        />
      </View>
      <Modal visible={Boolean(open)} animationType="slide" onRequestClose={() => setOpen(null)}>
        <Screen>
          <View style={{ paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }}>
            <Pressable accessibilityLabel="Close document" onPress={() => setOpen(null)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <IconClose size={18} color={colors.fg} />
            </Pressable>
            <T style={[type.headerBrand, { color: colors.fg, flex: 1 }]} numberOfLines={1}>
              {open?.title || "Document"}
            </T>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {open?.meta ? <T style={[type.metaLabel, { color: colors.muted, marginBottom: 12 }]}>{open.meta}</T> : null}
            <T style={[type.body, { color: colors.fg }]}>{open?.text || ""}</T>
            {open ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Ask about this in chat"
                onPress={() => {
                  const title = open.title;
                  setOpen(null);
                  router.push(`/chat/general?said=${encodeURIComponent(`Summarize and review "${title}" for next steps.`)}`);
                }}
                style={{ marginTop: 20, height: 46, borderRadius: 14, backgroundColor: colors.blueButton, alignItems: "center", justifyContent: "center" }}
              >
                <T style={[type.ctaLabel, { color: colors.white }]}>Ask about this in chat</T>
              </PressableScale>
            ) : null}
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}
