import { View } from "react-native";
import Svg, { Polygon, Text as SvgText } from "react-native-svg";
import { T } from "@/components/chrome";
import { colors, radii } from "@/theme/presenceTokens";

const SHAPES = ["squircle", "circle", "hexagon", "rect", "diamond"] as const;
export type AvatarShape = (typeof SHAPES)[number];

export function shapeFor(index: number): AvatarShape {
  return SHAPES[index % SHAPES.length] ?? "squircle";
}

function initialOf(name: string): string {
  const letter = name.trim().charAt(0).toUpperCase();
  return letter || "H";
}

export function ShapeAvatar({ name, shape }: { name: string; shape: AvatarShape }) {
  const initial = initialOf(name);
  if (shape === "hexagon") {
    return (
      <Svg width={44} height={44} viewBox="0 0 44 44">
        <Polygon points="22,2 40,12 40,32 22,42 4,32 4,12" fill={colors.avatarBg} stroke={colors.lineAvatar} strokeWidth={1} />
        <SvgText x={22} y={27} textAnchor="middle" fontSize={16} fontWeight="600" fill={colors.fgSecondary}>
          {initial}
        </SvgText>
      </Svg>
    );
  }
  if (shape === "diamond") {
    return (
      <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: 35,
            height: 35,
            borderRadius: radii.diamond,
            backgroundColor: colors.avatarBg,
            borderWidth: 1,
            borderColor: colors.lineAvatar,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ rotate: "45deg" }],
          }}
        >
          <T style={{ transform: [{ rotate: "-45deg" }], fontSize: 16, fontWeight: "600", color: colors.fgSecondary }}>{initial}</T>
        </View>
      </View>
    );
  }
  const radius = shape === "circle" ? 22 : shape === "rect" ? radii.inset : radii.squircle;
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: radius,
        backgroundColor: colors.avatarBg,
        borderWidth: 1,
        borderColor: colors.lineAvatar,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T style={{ fontSize: 16, fontWeight: "600", color: colors.fgSecondary }}>{initial}</T>
    </View>
  );
}
