import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { useEffect, type ReactNode } from "react";
import { Platform, View } from "react-native";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";
import { colors } from "@/theme/presenceTokens";
import { HatchProvider } from "@/state/hatch";
import { MotionProvider, useMotion } from "@/state/motion";
import { PrefsProvider } from "@/state/prefs";
import { SessionProvider } from "@/state/session";
import { SkiaProvider } from "@/state/skia";

void SplashScreen.preventAutoHideAsync();

const webMetrics: Metrics | undefined =
  Platform.OS === "web"
    ? {
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }
    : undefined;

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    border: colors.line,
    text: colors.fg,
    primary: colors.blueButton,
  },
};

function Boot({ children }: { children: ReactNode }) {
  const { ready } = useMotion();
  const [fontsLoaded, fontError] = useFonts({
    "JetBrainsMono-Regular": require("../assets/fonts/JetBrainsMono-Regular.ttf"),
    "JetBrainsMono-Medium": require("../assets/fonts/JetBrainsMono-Medium.ttf"),
  });
  useEffect(() => {
    if ((fontsLoaded || fontError) && ready) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded, ready]);
  if ((!fontsLoaded && !fontError) || !ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return children;
}

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider initialMetrics={webMetrics}>
        <MotionProvider>
          <SkiaProvider>
            <PrefsProvider>
              <SessionProvider>
                <HatchProvider>
                  <Boot>
                    <ThemeProvider value={navigationTheme}>
                      <StatusBar style="light" />
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          contentStyle: { backgroundColor: colors.bg },
                          animation: "slide_from_right",
                          animationDuration: 320,
                        }}
                      >
                        <Stack.Screen name="index" options={{ animation: "fade" }} />
                        <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
                        <Stack.Screen name="(app)" options={{ animation: "fade" }} />
                        <Stack.Screen name="voice" options={{ presentation: "fullScreenModal", animation: "fade", animationDuration: 320 }} />
                        <Stack.Screen name="chat/[agentId]" />
                        <Stack.Screen name="profile" options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="library" options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="routines" options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="ethics" />
                        <Stack.Screen name="plugins/index" options={{ animation: "slide_from_bottom" }} />
                        <Stack.Screen name="plugins/[id]" />
                      </Stack>
                    </ThemeProvider>
                  </Boot>
                </HatchProvider>
              </SessionProvider>
            </PrefsProvider>
          </SkiaProvider>
        </MotionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
