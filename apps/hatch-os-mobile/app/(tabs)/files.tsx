import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Screen, SearchField, T } from "@/components/chrome";
import { workspaceName } from "@/lib/derive";
import { useHatch } from "@/state/hatch";
import { colors, type } from "@/theme/presenceTokens";

export default function FilesScreen() {
  const { files, hostError } = useHatch();
  const [query, setQuery] = useState("");
  const rows = files.filter((file) => file.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Screen bottom={false}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <T style={[type.pageTitle, { color: colors.fg }]}>Files</T>
        <T style={[type.subcopy, { color: colors.muted, marginTop: 6, marginBottom: 16 }]}>Files saved on your firm’s host.</T>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search files" />
        <View style={{ gap: 8, marginTop: 12 }}>
          {hostError ? <T style={[type.cardSubcopy, { color: colors.muted }]}>{hostError}</T> : null}
          {rows.length === 0 ? (
            <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 15 }}>
              <T style={[type.rowTitle, { color: colors.fg }]}>No files yet</T>
              <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 4 }]}>
                <T style={{ color: "#FAFAFA", fontWeight: "500" }}>Attach a file</T>
                <T style={{ color: colors.muted }}> in a conversation and it will be saved here.</T>
              </T>
            </View>
          ) : (
            rows.map((file) => {
              const room = workspaceName(file.departmentId);
              return (
                <View key={file.id} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 15 }}>
                  <T style={[type.rowTitle, { color: colors.fg }]} numberOfLines={1}>
                    {file.name}
                  </T>
                  <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 3 }]}>
                    {[file.kind, room, file.status === "failed" ? "Could not read" : "On your firm’s host"].filter(Boolean).join(" · ")}
                  </T>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
