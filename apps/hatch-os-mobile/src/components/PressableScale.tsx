import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  style,
  children,
  ...props
}: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        scale.value = withTiming(0.97, { duration: 110, easing: Easing.out(Easing.cubic) });
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, { duration: 110, easing: Easing.out(Easing.cubic) });
        props.onPressOut?.(event);
      }}
      style={[animated, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
