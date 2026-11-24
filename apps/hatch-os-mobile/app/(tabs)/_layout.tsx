import { View } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PresenceDock } from "@/components/PresenceDock";
import { useRequireSession } from "@/state/session";
import { colors } from "@/theme/presenceTokens";

export default function TabsLayout() {
  useRequireSession();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" },
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="agents" />
        <Tabs.Screen name="files" />
      </Tabs>
      <PresenceDock />
    </View>
  );
}
