import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { deleteAccountServer, pair as pairRequest, setAuthToken, setUnauthorizedHandler, signOutServer } from "@/api/client";
import type { Session } from "@/api/types";
import { normalizeInvite } from "@/lib/derive";
import { kvDelete, kvGet, kvSet } from "@/lib/kv";

const KEY = "hatch.session";

interface SessionValue {
  ready: boolean;
  session: Session | null;
  signIn: (invite: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function asSession(data: {
  deviceName?: string;
  method?: "totp" | "passkey";
  role?: "Partner" | "Associate";
  departments?: string[];
  rooms?: string[];
  enterprise?: boolean;
  homeDepartment?: string;
  inviteCode?: string;
  testerLabel?: string;
  token?: string;
}, invite: string): Session {
  const departments = (data.departments || data.rooms || []).filter((id) => id && id !== "enterprise");
  const role = data.role === "Associate" ? "Associate" : "Partner";
  return {
    deviceName: data.deviceName || "This iPhone",
    method: data.method === "passkey" ? "passkey" : "totp",
    role,
    departments,
    enterprise: data.enterprise ?? role === "Partner",
    homeDepartment: data.homeDepartment || departments[0] || "hq-ops",
    pairedAt: new Date().toISOString(),
    inviteCode: data.inviteCode || invite,
    testerLabel: data.testerLabel || "",
    token: data.token,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    void kvGet(KEY).then((raw) => {
      if (!mounted) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Session;
          if (parsed?.token) {
            setAuthToken(parsed.token);
            setSession(parsed);
          } else {
            void kvDelete(KEY);
            setAuthToken("");
            setSession(null);
          }
        } catch {
          setAuthToken("");
          setSession(null);
        }
      }
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const signIn = useCallback(async (invite: string) => {
    const code = normalizeInvite(invite);
    if (!code) return "Ask your admin for an invite code.";
    try {
      const data = await pairRequest(code, "This iPhone");
      if (data.error) return data.error;
      const next = asSession(data, code);
      setAuthToken(next.token || "");
      await kvSet(KEY, JSON.stringify(next));
      setSession(next);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "This invite is not recognized. Ask your admin.";
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutServer().catch(() => undefined);
    setAuthToken("");
    await kvDelete(KEY);
    setSession(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await deleteAccountServer();
    setAuthToken("");
    await kvDelete(KEY);
    await kvDelete("hatch.prefs.v1").catch(() => undefined);
    await kvDelete("hatch.seen.v1").catch(() => undefined);
    setSession(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthToken("");
      void kvDelete(KEY);
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo(() => ({ ready, session, signIn, signOut, deleteAccount }), [ready, session, signIn, signOut, deleteAccount]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export function useRequireSession(): SessionValue {
  const value = useSession();
  const router = useRouter();
  useEffect(() => {
    if (value.ready && !value.session) router.replace("/sign-in");
  }, [router, value.ready, value.session]);
  return value;
}
