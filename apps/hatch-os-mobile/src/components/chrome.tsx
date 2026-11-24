import { useEffect, useRef, type ReactNode } from "react";
import { Platform, Pressable, Text, TextInput, View, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "@/theme/presenceTokens";
import { IconBack, IconSearch } from "./icons";
import { PressableScale } from "./PressableScale";

const webFamily = Platform.OS === "web" ? "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" : undefined;

export function T({ style, ...props }: TextProps) {
  return <Text {...props} style={[webFamily ? { fontFamily: webFamily } : null, style]} />;
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
        style={[webFamily ? { fontFamily: webFamily } : null, type.inputText, { flex: 1, color: colors.fg, padding: 0 }]}
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
  const x = useSharedValue(value ? 18 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 18 : 0, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      style={{
        width: 46,
        height: 28,
        borderRadius: 99,
        backgroundColor: value ? colors.blueButton : colors.switchOff,
        padding: 3,
        justifyContent: "center",
      }}
    >
      <Animated.View style={[{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white }, knob]} />
    </Pressable>
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
