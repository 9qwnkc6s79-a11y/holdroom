import { View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { T } from "@/components/chrome";
import { IconAgents, IconFiles, IconHome } from "@/components/icons";
import { PresenceSphere } from "@/components/PresenceSphere";
import { PressableScale } from "@/components/PressableScale";
import { hapticLight, hapticSelection } from "@/lib/haptics";
import { useHatch } from "@/state/hatch";
import { colors, type } from "@/theme/presenceTokens";
import type { SphereState } from "@/shader/sphereStates";

const TABS = [
  { id: "home", label: "Home", href: "/(tabs)/home" },
  { id: "agents", label: "Agents", href: "/(tabs)/agents" },
  { id: "files", label: "Files", href: "/(tabs)/files" },
] as const;

export function PresenceDock() {
  const router = useRouter();
  const path = usePathname();
  const { sphere } = useHatch();
  const active = path.includes("/agents") ? "agents" : path.includes("/files") ? "files" : "home";
  const orb: SphereState = sphere === "needsApproval" ? "needsApproval" : "idle";

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginBottom: 4,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 99,
        backgroundColor: colors.surfaceInput,
        borderWidth: 1,
        borderColor: colors.line,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Talk to Hatch"
        accessibilityHint="Opens voice mode"
        onPress={() => {
          void hapticLight();
          router.push("/voice");
        }}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <PresenceSphere preset="dock" state={orb} />
      </PressableScale>
      <View style={{ flex: 1, marginLeft: 8, flexDirection: "row", gap: 2 }}>
        {TABS.map((tab) => {
          const on = tab.id === active;
          const color = on ? colors.fg : colors.dockInactive;
          const Icon = tab.id === "home" ? IconHome : tab.id === "agents" ? IconAgents : IconFiles;
          return (
            <PressableScale
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tab.label}
              onPress={() => {
                if (on) return;
                void hapticSelection();
                router.navigate(tab.href);
              }}
              style={{
                flex: 1,
                height: 42,
                minWidth: 44,
                borderRadius: 99,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: on ? colors.dockActiveBg : "transparent",
              }}
            >
              <Icon size={16} color={color} />
              <T maxFontSizeMultiplier={1.25} style={[type.dockLabel, { color }]}>
                {tab.label}
              </T>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
