import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setHapticsEnabled } from "@/lib/haptics";
import { kvGet, kvSet } from "@/lib/kv";

const KEY = "hatch.prefs";

interface Prefs {
  haptics: boolean;
  voice: boolean;
  timeZoneAuto: boolean;
}

interface PrefsValue extends Prefs {
  ready: boolean;
  setHaptics: (value: boolean) => void;
  setVoice: (value: boolean) => void;
  setTimeZoneAuto: (value: boolean) => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>({ haptics: true, voice: true, timeZoneAuto: true });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void kvGet(KEY).then((raw) => {
      if (!mounted) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<Prefs>;
          setPrefs({
            haptics: parsed.haptics !== false,
            voice: parsed.voice !== false,
            timeZoneAuto: parsed.timeZoneAuto !== false,
          });
          setHapticsEnabled(parsed.haptics !== false);
        } catch {
          setHapticsEnabled(true);
        }
      }
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback((next: Prefs) => {
    setPrefs(next);
    setHapticsEnabled(next.haptics);
    void kvSet(KEY, JSON.stringify(next));
  }, []);

  const value = useMemo<PrefsValue>(
    () => ({
      ...prefs,
      ready,
      setHaptics: (haptics) => persist({ ...prefs, haptics }),
      setVoice: (voice) => persist({ ...prefs, voice }),
      setTimeZoneAuto: (timeZoneAuto) => persist({ ...prefs, timeZoneAuto }),
    }),
    [persist, prefs, ready],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("usePrefs must be used inside PrefsProvider");
  return value;
}
