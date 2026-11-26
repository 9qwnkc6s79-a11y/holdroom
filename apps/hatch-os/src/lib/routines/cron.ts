/**
 * Small 5-field cron engine for routines: minute hour day-of-month month day-of-week.
 * Supports `*`, lists (1,3,5), ranges (1-5), steps (* /15, 0-30/10) and day names.
 * Times are wall-clock in an IANA timezone (default America/Chicago), DST-aware.
 * No dependencies so it runs the same in tests, on Vercel, and on the Hatch box.
 */

export const DEFAULT_TZ = "America/Chicago";
/** A routine may not fire more often than this. Each agent run can wake the GPU. */
export const MIN_INTERVAL_MINUTES = 15;

export interface CronFields {
  minute: number[];
  hour: number[];
  dom: number[];
  month: number[];
  dow: number[];
  domStar: boolean;
  dowStar: boolean;
}

const DOW_NAMES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTH_NAMES: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseField(raw: string, min: number, max: number, names?: Record<string, number>): number[] | null {
  const out = new Set<number>();
  for (const part of raw.toLowerCase().split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return null;
    let lo = min;
    let hi = max;
    if (rangePart !== "*") {
      const bounds = rangePart.split("-");
      if (bounds.length > 2) return null;
      const read = (value: string) => {
        if (names && value in names) return names[value];
        if (!/^\d+$/.test(value)) return NaN;
        return Number(value);
      };
      lo = read(bounds[0]);
      hi = bounds.length === 2 ? read(bounds[1]) : stepPart === undefined ? lo : max;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    }
    // Day-of-week 7 is Sunday too.
    if (max === 6 && hi === 7) hi = 7;
    if (lo < min || hi > (max === 6 ? 7 : max) || lo > hi) return null;
    for (let value = lo; value <= hi; value += step) out.add(max === 6 && value === 7 ? 0 : value);
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

export function parseCron(expr: string): CronFields | null {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = parseField(parts[0], 0, 59);
  const hour = parseField(parts[1], 0, 23);
  const dom = parseField(parts[2], 1, 31);
  const month = parseField(parts[3], 1, 12, MONTH_NAMES);
  const dow = parseField(parts[4], 0, 6, DOW_NAMES);
  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow, domStar: parts[2] === "*", dowStar: parts[4] === "*" };
}

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let fmt = partsCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    partsCache.set(tz, fmt);
  }
  return fmt;
}

export function localParts(at: Date, tz: string): LocalParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(at).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: DOW_NAMES[String(parts.weekday).slice(0, 3).toLowerCase()] ?? 0,
  };
}

/** UTC instant for a wall-clock time in `tz`. Nonexistent DST times roll forward. */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const wantUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wantUtc;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), tz);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = wantUtc - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

function dayMatches(fields: CronFields, dom: number, month: number, weekday: number) {
  if (!fields.month.includes(month)) return false;
  const domOk = fields.dom.includes(dom);
  const dowOk = fields.dow.includes(weekday);
  // Standard cron: if both are restricted, either may match.
  if (!fields.domStar && !fields.dowStar) return domOk || dowOk;
  if (!fields.domStar) return domOk;
  if (!fields.dowStar) return dowOk;
  return true;
}

/** Next fire time strictly after `after`. Null when the expression never fires within ~1 year. */
export function nextRun(expr: string, after: Date, tz = DEFAULT_TZ): Date | null {
  const fields = parseCron(expr);
  if (!fields || !validTimeZone(tz)) return null;
  const start = localParts(after, tz);
  // Walk calendar days in the target zone.
  const base = Date.UTC(start.year, start.month - 1, start.day);
  for (let offset = 0; offset < 400; offset++) {
    const d = new Date(base + offset * 86_400_000);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    if (!dayMatches(fields, day, month, d.getUTCDay())) continue;
    for (const hour of fields.hour) {
      for (const minute of fields.minute) {
        const at = zonedTime(year, month, day, hour, minute, tz);
        if (at.getTime() > after.getTime()) return at;
      }
    }
  }
  return null;
}

export function upcomingRuns(expr: string, after: Date, count: number, tz = DEFAULT_TZ): Date[] {
  const out: Date[] = [];
  let cursor = after;
  for (let i = 0; i < count; i++) {
    const next = nextRun(expr, cursor, tz);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

/** Smallest gap (minutes) between the next 60 fires. Catches `* /5` and `0,5 9 * * *` alike. */
export function minGapMinutes(expr: string, tz = DEFAULT_TZ, from = new Date()): number {
  const runs = upcomingRuns(expr, from, 60, tz);
  let gap = Infinity;
  for (let i = 1; i < runs.length; i++) gap = Math.min(gap, (runs[i].getTime() - runs[i - 1].getTime()) / 60_000);
  return gap;
}

export function validateCron(expr: string, tz = DEFAULT_TZ): { ok: true } | { ok: false; error: string } {
  if (!parseCron(expr)) return { ok: false, error: "That schedule is not a valid cron expression (minute hour day month weekday)." };
  if (!validTimeZone(tz)) return { ok: false, error: `Unknown time zone “${tz}”.` };
  if (!nextRun(expr, new Date(), tz)) return { ok: false, error: "That schedule never runs." };
  if (minGapMinutes(expr, tz) < MIN_INTERVAL_MINUTES) {
    return { ok: false, error: `Routines can run at most every ${MIN_INTERVAL_MINUTES} minutes. Each run can wake the firm model.` };
  }
  return { ok: true };
}

const TZ_SHORT: Record<string, string> = {
  "America/Chicago": "CT",
  "America/New_York": "ET",
  "America/Denver": "MT",
  "America/Phoenix": "MST",
  "America/Los_Angeles": "PT",
  UTC: "UTC",
};

export function tzLabel(tz: string): string {
  return TZ_SHORT[tz] || tz;
}

export function clock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Plain-English label, e.g. "Weekdays at 7:00 AM CT". Falls back to the expression. */
export function describeCron(expr: string, tz = DEFAULT_TZ): string {
  const fields = parseCron(expr);
  if (!fields) return expr;
  const parts = expr.trim().split(/\s+/);
  const zone = tzLabel(tz);
  // Interval forms: */N minutes or 0 */N hours.
  const minuteStep = parts[0].match(/^\*\/(\d+)$/);
  if (minuteStep && parts[1] === "*" && fields.domStar && fields.dowStar) return `Every ${minuteStep[1]} minutes`;
  const hourStep = parts[1].match(/^\*\/(\d+)$/);
  if (hourStep && fields.minute.length === 1 && fields.domStar) {
    const days = fields.dowStar ? "" : dayText(fields.dow, " on ");
    return `Every ${hourStep[1] === "1" ? "hour" : `${hourStep[1]} hours`}${days}`;
  }
  if (parts[1] === "*" && fields.minute.length === 1) return `Every hour at :${String(fields.minute[0]).padStart(2, "0")}`;
  const times = fields.hour.length * fields.minute.length <= 3
    ? fields.hour.flatMap((h) => fields.minute.map((m) => clock(h, m))).join(", ")
    : `${fields.hour.length * fields.minute.length} times`;
  let days: string;
  if (!fields.domStar) {
    days = fields.dom.length === 1 ? `Monthly on the ${ordinal(fields.dom[0])}` : `Monthly on days ${fields.dom.join(", ")}`;
  } else if (fields.dowStar) {
    days = "Every day";
  } else {
    days = dayText(fields.dow, "");
  }
  return `${days} at ${times} ${zone}`.trim();
}

function dayText(dow: number[], prefix: string): string {
  const key = dow.join(",");
  if (key === "1,2,3,4,5") return `${prefix}${prefix ? "weekdays" : "Weekdays"}`;
  if (key === "0,6") return `${prefix}${prefix ? "weekends" : "Weekends"}`;
  if (dow.length === 7) return prefix ? "" : "Every day";
  if (dow.length === 1) return `${prefix}${prefix ? DAY_LONG[dow[0]] + "s" : "Every " + DAY_LONG[dow[0]]}`;
  return `${prefix}${dow.map((d) => DAY_SHORT[d]).join(", ")}`;
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th";
  return `${n}${s}`;
}

/** "Mon, Nov 30, 7:00 AM CT" */
export function formatWhen(at: Date | string | undefined | null, tz = DEFAULT_TZ): string {
  if (!at) return "";
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return "";
  const text = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  return `${text} ${tzLabel(tz)}`;
}
