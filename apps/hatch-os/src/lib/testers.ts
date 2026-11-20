export interface Tester {
  code: string;
  label: string;
}

export function parseTesterCodes(raw = process.env.HATCH_TESTER_CODES || ""): Tester[] {
  const seen = new Set<string>();
  const testers: Tester[] = [];
  for (const part of raw.split(",")) {
    const piece = part.trim();
    if (!piece) continue;
    const [codeRaw, ...labelParts] = piece.split(":");
    const code = codeRaw.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const label = labelParts.join(":").trim() || code;
    testers.push({ code, label });
  }
  return testers;
}

export function testerByCode(code: string): Tester | null {
  const normalized = code.trim().toUpperCase();
  return parseTesterCodes().find((tester) => tester.code === normalized) || null;
}

export function dailyMessageCap() {
  const parsed = Number(process.env.HATCH_DAILY_MESSAGE_CAP || "200");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 200;
}

export function safeCode(code: string) {
  const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
  return cleaned || "staff";
}
