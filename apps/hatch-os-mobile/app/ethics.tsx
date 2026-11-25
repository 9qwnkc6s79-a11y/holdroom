import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { getEthics, resetEthics, saveEthics } from "@/api/client";
import type { EthicsProfile } from "@/api/types";
import { Screen, Switch, T } from "@/components/chrome";
import { IconClose } from "@/components/icons";
import { PressableScale } from "@/components/PressableScale";
import { useRequireSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

const PRESETS: { id: EthicsProfile["preset"]; label: string }[] = [
  { id: "neutral", label: "Neutral" },
  { id: "executive", label: "Executive" },
  { id: "compliance", label: "Compliance" },
  { id: "custom", label: "Custom" },
];

const POSTURES: EthicsProfile["posture"][] = ["strict", "balanced", "direct"];
const TONES: EthicsProfile["tone"][] = ["concise", "warm", "blunt", "formal"];
const LENGTHS: EthicsProfile["length"][] = ["short", "balanced", "detailed"];
const MODELS: { id: EthicsProfile["model"]; label: string; detail: string }[] = [
  { id: "hermes", label: "Hermes 4.3 36B", detail: "Tool calling, mail & Drive reading" },
  { id: "qwen", label: "Qwen 3.8 27B", detail: "Plain Q&A and attached photos" },
];

export default function EthicsScreen() {
  useRequireSession();
  const router = useRouter();
  const [profile, setProfile] = useState<EthicsProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    void getEthics()
      .then((data) => setProfile(data.profile))
      .catch(() => setNote("Could not load Model & Ethics from your firm’s host."));
  }, []);

  async function onSave() {
    if (!profile || busy) return;
    setBusy(true);
    setNote("");
    try {
      const saved = await saveEthics(profile);
      setProfile(saved.profile);
      setNote("Saved.");
    } catch {
      setNote("Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      const reset = await resetEthics();
      setProfile(reset.profile);
      setNote("Reset to firm defaults.");
    } catch {
      setNote("Could not reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: 8, flexDirection: "row", alignItems: "center" }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Close Model and Ethics" onPress={() => (router.canGoBack() ? router.back() : router.replace("/profile"))} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconClose size={18} color={colors.fg} />
        </PressableScale>
        <T style={[type.headerBrand, { color: colors.fg, flex: 1 }]}>Model & Ethics</T>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}>
        <T style={[type.cardSubcopy, { color: colors.muted }]}>
          Set your firm’s charter, tone, and open model. Runs on Hatch beta test GPUs — avoid confidential client files.
        </T>
        {!profile ? (
          <T style={[type.cardSubcopy, { color: colors.muted }]}>{note || "Loading…"}</T>
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <T style={[type.metaLabel, { color: colors.dim }]}>MODEL</T>
              {MODELS.map((m) => {
                const on = profile.model === m.id;
                return (
                  <PressableScale
                    key={m.id}
                    accessibilityRole="button"
                    accessibilityLabel={m.label}
                    onPress={() => setProfile({ ...profile, model: m.id })}
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: on ? colors.blueButton : colors.line,
                      padding: 14,
                    }}
                  >
                    <T style={[type.rowTitle, { color: colors.fg }]}>{m.label}</T>
                    <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>{m.detail}</T>
                  </PressableScale>
                );
              })}
            </View>

            <View style={{ gap: 8 }}>
              <T style={[type.metaLabel, { color: colors.dim }]}>CHARTER PRESET</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {PRESETS.map((p) => {
                  const on = profile.preset === p.id;
                  return (
                    <PressableScale
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={p.label}
                      onPress={() => setProfile({ ...profile, preset: p.id })}
                      style={{
                        paddingHorizontal: 14,
                        height: 34,
                        borderRadius: 17,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: on ? colors.fg : colors.surface,
                      }}
                    >
                      <T style={[type.metaLabel, { color: on ? colors.bg : colors.fg }]}>{p.label}</T>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <T style={[type.metaLabel, { color: colors.dim }]}>FIRM CHARTER</T>
              <TextInput
                value={profile.charter}
                onChangeText={(charter) => setProfile({ ...profile, preset: "custom", charter })}
                multiline
                style={{
                  minHeight: 84,
                  backgroundColor: colors.surface,
                  borderRadius: 14,
                  padding: 12,
                  color: colors.fg,
                  fontSize: 15,
                  textAlignVertical: "top",
                }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <T style={[type.metaLabel, { color: colors.dim }]}>RED LINES</T>
              <TextInput
                value={profile.redLines}
                onChangeText={(redLines) => setProfile({ ...profile, preset: "custom", redLines })}
                multiline
                style={{
                  minHeight: 72,
                  backgroundColor: colors.surface,
                  borderRadius: 14,
                  padding: 12,
                  color: colors.fg,
                  fontSize: 15,
                  textAlignVertical: "top",
                }}
              />
            </View>

            <ChipGroup label="POSTURE" values={POSTURES} selected={profile.posture} onSelect={(posture) => setProfile({ ...profile, posture })} />
            <ChipGroup label="TONE" values={TONES} selected={profile.tone} onSelect={(tone) => setProfile({ ...profile, tone })} />
            <ChipGroup label="REPLY LENGTH" values={LENGTHS} selected={profile.length} onSelect={(length) => setProfile({ ...profile, length })} />

            <View style={{ backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T style={[type.rowTitle, { color: colors.fg }]}>Lead with the answer</T>
                <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 2 }]}>Put the decision or status first</T>
              </View>
              <Switch value={profile.leadWithAnswer} onValueChange={(leadWithAnswer) => setProfile({ ...profile, leadWithAnswer })} label="Lead with the answer" />
            </View>

            {note ? <T style={[type.cardSubcopy, { color: colors.blueSky }]}>{note}</T> : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Save"
                onPress={() => void onSave()}
                style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.blueButton, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}
              >
                <T style={[type.ctaLabel, { color: colors.white }]}>Save</T>
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Reset"
                onPress={() => void onReset()}
                style={{ height: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
              >
                <T style={[type.ctaLabel, { color: colors.fg }]}>Reset</T>
              </PressableScale>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function ChipGroup<T extends string>({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <T style={[type.metaLabel, { color: colors.dim }]}>{label}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {values.map((v) => {
          const on = v === selected;
          return (
            <PressableScale
              key={v}
              accessibilityRole="button"
              accessibilityLabel={v}
              onPress={() => onSelect(v)}
              style={{
                paddingHorizontal: 14,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: on ? colors.fg : colors.surface,
              }}
            >
              <T style={[type.metaLabel, { color: on ? colors.bg : colors.fg, textTransform: "capitalize" }]}>{v}</T>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
