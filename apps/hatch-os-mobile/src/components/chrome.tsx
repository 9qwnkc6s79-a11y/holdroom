import { useEffect, useRef, type ReactNode } from "react";
import { Platform, Switch as NativeSwitch, Text, TextInput, View, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "@/theme/presenceTokens";
import { IconBack, IconSearch } from "./icons";
import { PressableScale } from "./PressableScale";

/** iOS leaves fontFamily unset so the system font is SF Pro. Web falls through to Inter on this machine. */
export const uiFont =
  Platform.OS === "web"
    ? { fontFamily: "-apple-system, 'SF Pro Text', system-ui, Inter, sans-serif" }
    : null;

export function T({ style, ...props }: TextProps) {
  return <Text {...props} style={[uiFont, style]} />;
}

export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };
export const mono = { fontFamily: "JetBrainsMono-Medium" };
export const monoRegular = { fontFamily: "JetBrainsMono-Regular" };

export function Screen({
  children,
  bottom = true,
  style,
}: {
  children: ReactNode;
  bottom?: boolean;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: bottom ? insets.bottom : 0 }, style]}>
      {children}
    </View>
  );
}

export function StatusLine({ color, text, centered = false }: { color: string; text: string; centered?: boolean }) {
  const opacity = useSharedValue(1);
  const previous = useRef(text);
  useEffect(() => {
    if (previous.current === text) return;
    previous.current = text;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [opacity, text]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 7 }, centered ? { justifyContent: "center" } : null, animated]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <T style={[type.statusLine, { color: colors.muted, flexShrink: 1 }]} maxFontSizeMultiplier={1.25}>
        {text}
      </T>
    </Animated.View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View
      style={{
        height: 44,
        borderRadius: 12,
        backgroundColor: colors.surfaceInput,
        borderWidth: 1,
        borderColor: colors.lineSearch,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <IconSearch size={16} color={colors.dim} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[uiFont, type.inputText, { flex: 1, color: colors.fg, padding: 0 }]}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

export function Switch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <NativeSwitch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={label}
      trackColor={{ false: "#272730", true: "#406AD6" }}
      thumbColor="#FFFFFF"
      ios_backgroundColor="#272730"
      {...(Platform.OS === "web" ? { activeThumbColor: "#FFFFFF" } : {})}
    />
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <IconBack size={22} color={colors.fg} strokeWidth={1.75} />
    </PressableScale>
  );
}

export function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 15 }}>
      <T style={[type.rowTitle, { color: colors.fg }]}>{title}</T>
      <T style={[type.cardSubcopy, { color: colors.muted, marginTop: 4 }]}>{body}</T>
    </View>
  );
}
