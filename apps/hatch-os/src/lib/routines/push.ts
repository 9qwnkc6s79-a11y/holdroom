/**
 * Expo push plumbing. Off unless HATCH_PUSH=on, and the iPhone app does not
 * register a token yet (needs expo-notifications in a new build).
 *
 * Push text goes through Expo's and Apple's servers, so it is always generic:
 * no routine names, no email content. Firm content stays in Hatch.
 */
import { readRecord, saveRecord } from "../beta-store.ts";
import { safeCode } from "../testers.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function pushEnabled() {
  return (process.env.HATCH_PUSH || "off").toLowerCase() === "on";
}

export function validExpoToken(token: string) {
  return /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/.test(String(token || ""));
}

interface TokenDoc {
  tokens: { token: string; device?: string; at: string }[];
}

function folder(scope: string) {
  return `push/${safeCode(scope || "staff")}`;
}

export async function registerPushToken(scope: string, token: string, device?: string) {
  if (!validExpoToken(token)) return { ok: false as const, error: "That is not an Expo push token." };
  const doc = (await readRecord<TokenDoc>(folder(scope), "tokens")) || { tokens: [] };
  const tokens = [{ token, device: device?.slice(0, 80), at: new Date().toISOString() }, ...doc.tokens.filter((t) => t.token !== token)].slice(0, 5);
  await saveRecord(folder(scope), "tokens", { tokens });
  return { ok: true as const };
}

export type PushKind = "result" | "approval";

export function pushCopy(kind: PushKind, count: number) {
  if (kind === "approval") return { title: "Hatch", body: "A routine needs your approval. Open Hatch to review it." };
  return { title: "Hatch", body: count > 1 ? `${count} routine results are ready in Hatch.` : "A routine result is ready in Hatch." };
}

/** Sends a generic notice to every device on the scope. Never throws. */
export async function sendPush(scope: string, kind: PushKind, count = 1, fetcher: typeof fetch = fetch): Promise<number> {
  if (!pushEnabled()) return 0;
  const doc = await readRecord<TokenDoc>(folder(scope), "tokens").catch(() => null);
  const tokens = (doc?.tokens || []).map((t) => t.token).filter(validExpoToken);
  if (!tokens.length) return 0;
  const copy = pushCopy(kind, count);
  const res = await fetcher(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(tokens.map((to) => ({ to, title: copy.title, body: copy.body, sound: "default", data: { screen: "routines" } }))),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return res?.ok ? tokens.length : 0;
}
