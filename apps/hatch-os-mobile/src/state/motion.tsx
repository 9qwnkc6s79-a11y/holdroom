import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

interface MotionValue {
  ready: boolean;
  systemReduced: boolean;
  reduced: SharedValue<number>;
}

const MotionContext = createContext<MotionValue | null>(null);

export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useSharedValue(0);
  const [systemReduced, setSystemReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!mounted) return;
      setSystemReduced(value);
      reduced.value = value ? 1 : 0;
      setReady(true);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      setSystemReduced(value);
      reduced.value = value ? 1 : 0;
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [reduced]);

  const value = useMemo(() => ({ ready, systemReduced, reduced }), [ready, reduced, systemReduced]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion(): MotionValue {
  const value = useContext(MotionContext);
  if (!value) throw new Error("useMotion must be used inside MotionProvider");
  return value;
}
