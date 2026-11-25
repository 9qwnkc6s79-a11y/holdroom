import { useEffect, useState } from "react";
import { Linking, Platform, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { privacyUrl, termsUrl } from "@/api/config";
import { useRouter } from "expo-router";
import { HatchMark } from "@/components/icons";
import { PresenceSphere } from "@/components/PresenceSphere";
import { PressableScale } from "@/components/PressableScale";
import { Screen, T, mono } from "@/components/chrome";
import { hapticMedium } from "@/lib/haptics";
import { useSession } from "@/state/session";
import { colors, type } from "@/theme/presenceTokens";

export default function SignInScreen() {
  const router = useRouter();
  const { session, signIn } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) router.replace("/bots");
  }, [router, session]);

  async function openLegal(url: string) {
    if (Platform.OS === "web") {
      await Linking.openURL(url);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    const message = await signIn(code);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    void hapticMedium();
    router.replace("/bots");
  }

  return (
    <Screen>
      <View style={{ paddingTop: 18, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <HatchMark size={22} />
        <T style={[type.headerBrand, { color: colors.fg }]} maxFontSizeMultiplier={1.25}>
          Hatch
        </T>
      </View>
      <View style={{ paddingTop: 28, paddingHorizontal: 24, gap: 0 }}>
        <PresenceSphere preset="signIn" state="idle" />
        <T style={[type.signInTitle, { color: colors.fg, marginTop: 22 }]}>Sign in to your firm</T>
        <T style={[type.body, { color: colors.muted, marginTop: 10 }]}>
          Enter your invite code to connect to your firm’s private host. Work stays off OpenAI and Anthropic.
        </T>
        <T style={[type.statusLine, { color: colors.muted, marginTop: 22, marginBottom: 8 }]}>Invite code</T>
        <TextInput
          value={code}
          onChangeText={(value) => setCode(value.toUpperCase())}
          placeholder="XXXX-XXXX"
          placeholderTextColor={colors.dim}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Invite code"
          style={[
            mono,
            {
              height: 52,
              borderRadius: 14,
              backgroundColor: colors.surfaceInput,
              borderWidth: 1,
              borderColor: colors.lineInputFocus,
              paddingHorizontal: 16,
              color: colors.fg,
              fontSize: 16,
              letterSpacing: 1,
            },
          ]}
        />
        {error ? <T style={[type.cardSubcopy, { color: colors.fg, marginTop: 10 }]}>{error}</T> : null}
        <PressableScale
          onPress={() => void submit()}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          style={{
            marginTop: 14,
            height: 50,
            borderRadius: 14,
            backgroundColor: colors.blueButton,
            alignItems: "center",
            justifyContent: "center",
            opacity: busy ? 0.7 : 1,
          }}
        >
          <T style={[type.ctaLabel, { color: colors.white }]}>{busy ? "Continuing…" : "Continue"}</T>
        </PressableScale>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ marginHorizontal: 24, marginBottom: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: 14, paddingRight: 16, paddingLeft: 18 }}>
        <View style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 2.5, backgroundColor: colors.amber, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />
        <T style={[type.rowTitle, { color: colors.amberSoft }]}>TestFlight preview</T>
        <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 4 }]}>
          Use your firm’s invite code before sending confidential client files.
        </T>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 18, paddingBottom: 14 }}>
        <PressableScale accessibilityRole="link" accessibilityLabel="Privacy Policy" onPress={() => void openLegal(privacyUrl())}>
          <T style={[type.metaLabel, { color: colors.muted }]}>Privacy Policy</T>
        </PressableScale>
        <PressableScale accessibilityRole="link" accessibilityLabel="Terms of Service" onPress={() => void openLegal(termsUrl())}>
          <T style={[type.metaLabel, { color: colors.muted }]}>Terms of Service</T>
        </PressableScale>
      </View>
    </Screen>
  );
}
