/**
 * Plain-language routine asks → a proposed routine (never saved here).
 *
 *   "remind me every Monday to call Rick"            → reminder, 0 8 * * 1
 *   "brief me on open vendor threads every weekday at 7am" → agent run, 0 7 * * 1-5
 *   "tell me when Robert replies"                    → email trigger, notify only
 *   "remind me tomorrow at 9 to send the W-9"        → one-time reminder
 *
 * Rule-based on purpose: it runs before any model call, so proposing a routine
 * never wakes the GPU. The user confirms or edits the card before anything is saved.
 */
import { DEFAULT_TZ, describeCron, formatWhen, localParts, validateCron, zonedTime } from "./cron.ts";

export type RoutineMode = "agent" | "reminder" | "notify";

export interface RoutineProposal {
  name: string;
  prompt: string;
  mode: RoutineMode;
  timezone: string;
  /** Recurring schedule. */
  cron?: string;
  /** One-time run (ISO). */
  runAt?: string;
  /** Email trigger (Gmail search syntax). */
  triggerQuery?: string;
  /** Human label for the card, e.g. "Weekdays at 7:00 AM CT". */
  when: string;
  /** Things the parser guessed, shown on the card so the user can fix them. */
  assumptions: string[];
}

export interface ParseOptions {
  now?: Date;
  timezone?: string;
  people?: { name: string; aliases?: string[]; email?: string }[];
}

const LEAD = /^\s*(?:(?:hey|ok(?:ay)?|so|hatch)[,\s]+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|please\s+|pls\s+|plz\s+|i\s+(?:want|need)\s+you\s+to\s+|i(?:'d|\s+would)\s+like\s+you\s+to\s+|go\s+ahead\s+and\s+)?/i;

const REMIND = /^remind\s+me\b/i;
const TRIGGER_START = /^(?:(?:tell|let)\s+me(?:\s+know)?|ping\s+me|notify\s+me|alert\s+me|text\s+me|flag\s+(?:it|that)?\s*(?:for\s+me)?|give\s+me\s+a\s+heads?\s*up)\s+(?:when(?:ever)?|if|as\s+soon\s+as|once)\b/i;
const WHEN_START = /^(?:when(?:ever)?|if|as\s+soon\s+as|once)\s+.+?\b(?:replies|responds|answers|emails?|writes|sends|gets\s+back|comes\s+in|arrives|shows\s+up)\b/i;
const META = /^(?:set\s+up|setup|create|make|add|schedule|start)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:routine|recurring|daily|weekly|reminder)\b/i;
const IMPERATIVE = /^(?:brief|send|give|check|summari[sz]e|ping|email|text|update|show|pull|review|compile|draft|look|scan|tell|list|recap|report|go\s+through|keep|run|prep(?:are)?|watch|monitor|get)\b/i;

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, sundays: 0,
  mon: 1, monday: 1, mondays: 1,
  tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, weds: 3, wednesday: 3, wednesdays: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  fri: 5, friday: 5, fridays: 5,
  sat: 6, saturday: 6, saturdays: 6,
};
const DAY_RE = "(?:sun(?:day)?s?|mon(?:day)?s?|tue(?:s|sday)?s?|wed(?:s|nesday)?s?|thu(?:r|rs|rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?)";
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, twelve: 12, fifteen: 15, thirty: 30 };

const RECURRENCE = new RegExp(
  [
    `\\b(?:every|each)\\s+(?:other\\s+)?(?:single\\s+)?(?:day|morning|afternoon|evening|night|weekday|weekdays|workday|work\\s+day|business\\s+day|weekend|week|month|hour|${DAY_RE}(?:\\s*(?:,|and|&|\\/)\\s*${DAY_RE})*)\\b`,
    `\\b(?:every|each)\\s+(?:\\d+|a|an|one|two|three|four|five|six|eight|twelve|fifteen|thirty)\\s+(?:hours?|hrs?|minutes?|mins?)\\b`,
    `\\b(?:daily|weekly|hourly|monthly|nightly|weekdays?|weeknights)\\b`,
    `\\bon\\s+${DAY_RE}s\\b`,
    `\\b(?:mon|tue|wed|thu|fri)(?:day)?\\s*(?:-|through|thru|to)\\s*(?:mon|tue|wed|thu|fri)(?:day)?\\b`,
  ].join("|"),
  "i",
);

/** Is this a routine ask at all? Cheap test used before any routing. */
export function looksLikeRoutine(text: string): boolean {
  const body = String(text || "").replace(LEAD, "").trim();
  if (!body || body.length > 600) return false;
  if (/\?\s*$/.test(body) && !REMIND.test(body) && !TRIGGER_START.test(body)) return false;
  if (REMIND.test(body) || TRIGGER_START.test(body) || META.test(body)) return true;
  if (WHEN_START.test(body) && /\b(?:tell|let|ping|notify|alert|text)\s+me\b/i.test(body)) return true;
  if (/^(?:every|each)\b/i.test(body) && RECURRENCE.test(body)) return true;
  if (/^(?:daily|weekly|weekday|on\s+weekdays|on\s+mondays)/i.test(body)) return true;
  return IMPERATIVE.test(body) && RECURRENCE.test(body);
}

interface TimeHit {
  hour: number;
  minute: number;
  match: string;
  guessed: boolean;
}

function findTime(text: string): TimeHit | null {
  const explicit = text.match(/\b(?:at|@|around|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\W|$)/i);
  if (explicit) {
    let hour = Number(explicit[1]) % 12;
    if (/p/i.test(explicit[3])) hour += 12;
    return { hour, minute: Number(explicit[2] || 0), match: explicit[0], guessed: false };
  }
  const colon = text.match(/\b(?:at|@|around|by)?\s*(\d{1,2}):(\d{2})\b/i);
  if (colon) {
    let hour = Number(colon[1]);
    if (hour >= 1 && hour <= 6) hour += 12;
    return { hour: hour % 24, minute: Number(colon[2]), match: colon[0], guessed: Number(colon[1]) <= 12 };
  }
  const bare = text.match(/\b(?:at|@|around)\s+(\d{1,2})\b(?!\s*(?:hours?|hrs?|minutes?|mins?|days?|%))/i);
  if (bare && Number(bare[1]) <= 23) {
    let hour = Number(bare[1]);
    if (hour >= 1 && hour <= 6) hour += 12;
    return { hour: hour % 24, minute: 0, match: bare[0], guessed: Number(bare[1]) <= 12 };
  }
  const words: [RegExp, number, number][] = [
    [/\b(?:at\s+)?noon\b|\b(?:at\s+)?lunch(?:time)?\b/i, 12, 0],
    [/\b(?:at\s+)?midnight\b/i, 0, 0],
    [/\bfirst\s+thing(?:\s+in\s+the\s+morning)?\b/i, 7, 0],
    [/\b(?:end\s+of\s+(?:the\s+)?(?:day|business)|eod|cob|close\s+of\s+business)\b/i, 17, 0],
    [/\b(?:in\s+the\s+)?afternoons?\b/i, 13, 0],
    [/\b(?:in\s+the\s+)?evenings?\b/i, 17, 0],
    [/\b(?:at\s+)?night\b|\btonight\b|\bnightly\b|\bweeknights\b/i, 20, 0],
    [/\b(?:in\s+the\s+)?mornings?\b/i, 8, 0],
  ];
  for (const [re, hour, minute] of words) {
    const m = text.match(re);
    if (m) return { hour, minute, match: /tonight|nightly|weeknights/i.test(m[0]) ? "" : m[0], guessed: true };
  }
  return null;
}

function dayList(raw: string): number[] {
  const days = new Set<number>();
  const range = raw.match(/\b(mon|tue|wed|thu|fri)(?:day)?\s*(?:-|through|thru|to)\s*(mon|tue|wed|thu|fri)(?:day)?\b/i);
  if (range) {
    const a = DAY_WORDS[range[1].toLowerCase()];
    const b = DAY_WORDS[range[2].toLowerCase()];
    for (let d = a; d <= b; d++) days.add(d);
  }
  for (const word of raw.toLowerCase().match(new RegExp(`\\b${DAY_RE}\\b`, "g")) || []) {
    if (word in DAY_WORDS) days.add(DAY_WORDS[word]);
  }
  return [...days].sort((a, b) => a - b);
}

interface ScheduleHit {
  cron?: string;
  runAt?: Date;
  remove: string[];
  assumptions: string[];
}

function scheduleFrom(text: string, now: Date, tz: string): ScheduleHit | null {
  const assumptions: string[] = [];
  const remove: string[] = [];
  const time = findTime(text);
  if (time?.match) remove.push(time.match);
  const at = (h: number, m: number) => ({ h: time ? time.hour : h, m: time ? time.minute : m });

  // Every N minutes / hours.
  const interval = text.match(/\b(?:every|each)\s+(\d+|a|an|one|two|three|four|five|six|eight|twelve|fifteen|thirty)\s+(hours?|hrs?|minutes?|mins?)\b/i);
  if (interval) {
    remove.push(interval[0]);
    const n = /^\d+$/.test(interval[1]) ? Number(interval[1]) : NUM_WORDS[interval[1].toLowerCase()] || 1;
    if (/^h/i.test(interval[2])) {
      const hours = Math.max(1, Math.min(12, n));
      const weekdays = /\b(?:weekdays?|work\s*days?|business\s+days?|during\s+the\s+week)\b/i.test(text);
      if (weekdays) remove.push(text.match(/\b(?:on\s+)?(?:weekdays?|work\s*days?|business\s+days?|during\s+the\s+week)\b/i)![0]);
      return { cron: `0 ${hours === 1 ? "*" : `*/${hours}`} * * ${weekdays ? "1-5" : "*"}`, remove, assumptions };
    }
    const minutes = Math.max(15, n);
    if (n < 15) assumptions.push(`Routines run at most every 15 minutes, so this uses every 15 minutes.`);
    const step = [15, 20, 30].includes(minutes) ? minutes : minutes >= 60 ? 60 : 30;
    if (step === 60) return { cron: "0 * * * *", remove, assumptions };
    return { cron: `*/${step} * * * *`, remove, assumptions };
  }
  if (/\b(?:every|each)\s+hour\b|\bhourly\b/i.test(text)) {
    remove.push(text.match(/\b(?:every|each)\s+hour\b|\bhourly\b/i)![0]);
    return { cron: "0 * * * *", remove, assumptions };
  }

  const weekdayRe = /\b(?:(?:every|each|on)\s+)?(?:weekday|weekdays|workday|work\s+day|business\s+day|weekday\s+mornings?|weeknights)\b|\b(?:every|each)\s+(?:work|business)\s+day\b/i;
  const dailyRe = /\b(?:every|each)\s+(?:single\s+)?(?:day|morning|afternoon|evening|night)\b|\b(?:daily|nightly)\b/i;
  const weekendRe = /\b(?:every|each|on)\s+(?:the\s+)?weekends?\b/i;
  const weeklyRe = /\b(?:every|each)\s+week\b|\bweekly\b/i;
  const monthlyRe = /\b(?:every|each)\s+month\b|\bmonthly\b/i;
  const dayRe = new RegExp(`\\b(?:(?:every|each|on)\\s+(?:other\\s+)?)?${DAY_RE}(?:\\s*(?:,|and|&|\\/)\\s*${DAY_RE})*\\b|\\b(?:mon|tue|wed|thu|fri)(?:day)?\\s*(?:-|through|thru|to)\\s*(?:mon|tue|wed|thu|fri)(?:day)?\\b`, "i");

  const minuteHour = (h: number, m: number) => {
    const t = at(h, m);
    if (!time) assumptions.push(`No time given, so it runs at ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}.`);
    else if (time.guessed && !/[ap]\.?m/i.test(time.match) && time.match) assumptions.push(`Read “${time.match.trim()}” as ${t.h % 12 || 12}:${String(t.m).padStart(2, "0")} ${t.h < 12 ? "AM" : "PM"}.`);
    return `${t.m} ${t.h}`;
  };

  const weekday = text.match(weekdayRe);
  if (weekday) {
    remove.push(weekday[0]);
    return { cron: `${minuteHour(/night/i.test(weekday[0]) ? 20 : 8, 0)} * * 1-5`, remove, assumptions };
  }
  const weekend = text.match(weekendRe);
  if (weekend) {
    remove.push(weekend[0]);
    return { cron: `${minuteHour(9, 0)} * * 0,6`, remove, assumptions };
  }
  const named = text.match(dayRe);
  if (named && (/\b(?:every|each)\b/i.test(named[0]) || /days\b/i.test(named[0]) || /-|through|thru|\bto\b/i.test(named[0]))) {
    const days = dayList(named[0]);
    if (days.length) {
      remove.push(named[0]);
      if (/\bother\b/i.test(named[0])) assumptions.push("Every-other-week is not supported yet, so it runs every week.");
      return { cron: `${minuteHour(8, 0)} * * ${days.join(",")}`, remove, assumptions };
    }
  }
  const daily = text.match(dailyRe);
  if (daily) {
    remove.push(daily[0]);
    const word = daily[0].toLowerCase();
    const h = /afternoon/.test(word) ? 13 : /evening/.test(word) ? 17 : /night/.test(word) ? 20 : 8;
    if (!time && /morning|afternoon|evening|night/.test(word)) {
      return { cron: `0 ${h} * * *`, remove, assumptions: [...assumptions, `“${daily[0].trim()}” is set to ${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}.`] };
    }
    return { cron: `${minuteHour(h, 0)} * * *`, remove, assumptions };
  }
  const weekly = text.match(weeklyRe);
  if (weekly) {
    remove.push(weekly[0]);
    assumptions.push("Weekly routines run on Mondays unless you pick a day.");
    return { cron: `${minuteHour(8, 0)} * * 1`, remove, assumptions };
  }
  const monthly = text.match(monthlyRe);
  if (monthly) {
    remove.push(monthly[0]);
    const dom = text.match(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/i);
    if (dom) remove.push(dom[0]);
    if (!dom) assumptions.push("Monthly routines run on the 1st unless you pick a day.");
    return { cron: `${minuteHour(8, 0)} ${dom ? Math.min(28, Number(dom[1])) : 1} * *`, remove, assumptions };
  }

  // One-time: "in 2 hours", "tomorrow at 9", "on friday", "at 3pm", "tonight".
  const local = localParts(now, tz);
  const inDelta = text.match(/\bin\s+(\d+|a|an|one|two|three|four|five|six|eight|twelve|fifteen|thirty)\s+(minutes?|mins?|hours?|hrs?|days?)\b/i);
  if (inDelta) {
    remove.push(inDelta[0]);
    const n = /^\d+$/.test(inDelta[1]) ? Number(inDelta[1]) : NUM_WORDS[inDelta[1].toLowerCase()] || 1;
    const unit = /^m/i.test(inDelta[2]) ? 60_000 : /^h/i.test(inDelta[2]) ? 3_600_000 : 86_400_000;
    return { runAt: new Date(now.getTime() + n * unit), remove, assumptions };
  }
  let dayOffset: number | null = null;
  const tomorrow = text.match(/\b(?:tomorrow|tmrw|tmr|tomorow)\b(?:\s+morning|\s+afternoon|\s+evening|\s+night)?/i);
  const today = text.match(/\b(?:today|tonight|this\s+(?:morning|afternoon|evening))\b/i);
  const onDay = text.match(new RegExp(`\\b(?:on\\s+|this\\s+|next\\s+)?${DAY_RE}\\b`, "i"));
  if (tomorrow) {
    dayOffset = 1;
    remove.push(tomorrow[0]);
  } else if (today) {
    dayOffset = 0;
    remove.push(today[0]);
  } else if (onDay) {
    const target = dayList(onDay[0])[0];
    if (target !== undefined) {
      dayOffset = (target - local.weekday + 7) % 7 || 7;
      remove.push(onDay[0]);
    }
  }
  if (dayOffset === null && !time) return null;
  const hit = time || { hour: 9, minute: 0, match: "", guessed: true };
  if (!time) assumptions.push("No time given, so it is set for 9:00 AM.");
  const base = new Date(Date.UTC(local.year, local.month - 1, local.day) + (dayOffset ?? 0) * 86_400_000);
  let runAt = zonedTime(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hit.hour, hit.minute, tz);
  if (runAt.getTime() <= now.getTime()) {
    // "at 3pm" when it's already 4pm → tomorrow.
    const next = new Date(base.getTime() + 86_400_000);
    runAt = zonedTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hit.hour, hit.minute, tz);
  }
  return { runAt, remove, assumptions };
}

function tidy(text: string): string {
  return text
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/^[\s,.;:–—-]+|[\s,;:–—-]+$/g, "")
    .replace(/\b(?:and|then|,)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function strip(text: string, pieces: string[]): string {
  let out = ` ${text} `;
  for (const piece of pieces.filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.split(piece).join(" ");
  }
  return tidy(out.replace(/\b(?:at|on|by|around)\s*(?=[,.]|$)/gi, " ").replace(/\s+(?:at|on)\s+(?=to\b)/gi, " "));
}

function sentence(text: string): string {
  const t = tidy(text).replace(/[.!]+$/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function nameFrom(text: string, fallback: string): string {
  const t = sentence(text).replace(/^(?:to|about|that)\s+/i, "");
  const name = (t || fallback).replace(/^(.)/, (c) => c.toUpperCase());
  return name.length > 48 ? `${name.slice(0, 47).replace(/\s+\S*$/, "")}…` : name;
}

function cutClause(text: string): string {
  return text.split(/[,;.!?]|\s+(?:and|then|so|&)\s+/i)[0].trim();
}

function triggerQuery(body: string, people: ParseOptions["people"]): { query: string; who?: string; about?: string } | null {
  const lead = String.raw`\b(?:when(?:ever)?|if|as\s+soon\s+as|once)\s+(?:there(?:'s|\s+is)\s+)?`;
  const generic = body.match(new RegExp(`${lead}(?:an?|any|new)\\s+(?:new\\s+)?(?:e-?mail|message|reply|response|note)s?(?:\\s+from\\s+(.+?))?(?:\\s+(?:about|re|regarding|on)\\s+(.+?))?\\s+(?:comes\\s+in|arrives|shows\\s+up|lands|hits(?:\\s+my\\s+inbox)?)\\b`, "i"))
    || body.match(new RegExp(`${lead}(?:an?|any|new)\\s+(?:new\\s+)?(?:e-?mail|message|reply|response|note)s?(?:\\s+from\\s+([^,;.]+?))?(?:\\s+(?:about|re|regarding|on)\\s+([^,;.]+))?\\s*(?:[,;.]|$)`, "i"));
  let who = "";
  let about = "";
  if (generic) {
    who = (generic[1] || "").trim();
    about = cutClause(generic[2] || "");
  } else {
    const person = body.match(new RegExp(`${lead}(.+?)\\s+(?:replies|responds|answers|e-?mails?(?:\\s+(?:me|us|back))?|writes(?:\\s+(?:me|us|back))?|sends\\s+(?:me|us)(?:\\s+(?:an?\\s+)?(?:email|message|note))?|gets\\s+back(?:\\s+to\\s+(?:me|us))?)\\b(.*)$`, "i"));
    if (!person) return null;
    who = person[1].trim();
    const aboutIn = (person[2] || "").match(/^\s*(?:about|re|regarding|on)\s+(.+)$/i);
    if (aboutIn) about = cutClause(aboutIn[1]);
    const fromAbout = who.match(/^(.+?)\s+(?:about|re|regarding)\s+(.+)$/i);
    if (fromAbout) {
      who = fromAbout[1];
      about = about || cutClause(fromAbout[2]);
    }
    if (/^(?:an?|any|anyone|anybody|someone|somebody)$/i.test(who)) who = "";
  }
  who = who.replace(/^(?:from|the\s+guy\s+from)\s+/i, "").replace(/['’]s$/, "").trim();
  about = about.replace(/^(?:the|a|an|our|my)\s+/i, "").replace(/[.?!]+$/, "").trim();
  const parts: string[] = [];
  if (who) {
    const lower = who.toLowerCase();
    const person = (people || []).find((p) => p.email && [p.name, ...(p.aliases || [])].some((n) => n && (n.toLowerCase() === lower || n.toLowerCase().split(/\s+/)[0] === lower)));
    if (person?.email) parts.push(`from:${person.email}`);
    else parts.push(`from:${/\s/.test(who) ? `"${who.replace(/"/g, "")}"` : who.toLowerCase()}`);
  }
  if (about) parts.push(/\s/.test(about) ? `"${about.replace(/"/g, "")}"` : about);
  if (!parts.length) return null;
  const pretty = who ? who.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
  return { query: parts.join(" "), who: pretty, about: about || undefined };
}

const AGENTIC = /\b(?:summari[sz]e|summary|brief|draft|reply|respond|analy[sz]e|what\s+(?:he|she|they|it)\s+(?:said|says|wants)|tell\s+me\s+what|read\s+it|pull|check|review|recap|look\s+(?:at|into|up)|find|list|compile|prepare|prep|status|update\s+on|open\s+(?:threads|items)|catch\s+me\s+up)\b/i;

/**
 * Turn a routine ask into a proposal. Returns null when it isn't one (the
 * normal chat path then handles it).
 */
export function parseRoutineAsk(raw: string, opts: ParseOptions = {}): RoutineProposal | null {
  const tz = opts.timezone || DEFAULT_TZ;
  const now = opts.now || new Date();
  const text = String(raw || "").trim();
  if (!looksLikeRoutine(text)) return null;
  const body = text.replace(LEAD, "").trim();

  // Email triggers.
  if (TRIGGER_START.test(body) || (WHEN_START.test(body) && /\b(?:tell|let|ping|notify|alert|text)\s+me\b/i.test(body))) {
    const trig = triggerQuery(body, opts.people);
    if (trig) {
      const agentic = AGENTIC.test(body.replace(TRIGGER_START, ""));
      const who = trig.who ? trig.who.replace(/^./, (c) => c.toUpperCase()) : "";
      const name = who ? `When ${who} ${/reply|replies|respond|gets back/i.test(body) ? "replies" : "emails"}` : `New email about ${trig.about}`;
      return {
        name: name.length > 48 ? `${name.slice(0, 47)}…` : name,
        prompt: agentic
          ? sentence(body)
          : `Tell me when a new email matches: ${trig.query}`,
        mode: agentic ? "agent" : "notify",
        timezone: tz,
        triggerQuery: trig.query,
        when: `When a new email matches ${trig.query} (checked every 15 minutes)`,
        assumptions: [
          ...(trig.who && !trig.query.includes("@") ? [`Matches any sender named “${trig.who}”. Add their email address if that is too broad.`] : []),
          ...(agentic ? ["Each match runs the firm model, which can wake the GPU."] : ["Posts the sender, subject, and first line. It does not wake the firm model."]),
        ],
      };
    }
  }

  const sched = scheduleFrom(body, now, tz);
  if (!sched) {
    if (!REMIND.test(body) && !META.test(body)) return null;
  }
  const reminder = REMIND.test(body);
  let rest = body.replace(META, "").replace(/^\s*(?:to|that|for|which)\s+/i, "");
  rest = sched ? strip(rest, sched.remove) : tidy(rest);
  if (reminder) rest = rest.replace(REMIND, "").replace(/^\s*(?:to|about|that|of)\s+/i, "").trim();
  rest = tidy(rest.replace(/^(?:to|and)\s+/i, ""));
  if (!rest) return null;

  const cron = sched?.cron;
  let runAt = sched?.runAt;
  const assumptions = [...(sched?.assumptions || [])];
  if (!cron && !runAt) {
    // "remind me to send the W-9" with no time: tomorrow 9 AM.
    const local = localParts(now, tz);
    const next = new Date(Date.UTC(local.year, local.month - 1, local.day) + 86_400_000);
    runAt = zonedTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 9, 0, tz);
    assumptions.push("No time given, so it is set for tomorrow at 9:00 AM.");
  }
  if (cron && !validateCron(cron, tz).ok) return null;

  const mode: RoutineMode = reminder ? "reminder" : "agent";
  const prompt = reminder ? sentence(rest) : sentence(rest);
  return {
    name: nameFrom(rest, reminder ? "Reminder" : "Routine"),
    prompt,
    mode,
    timezone: tz,
    cron,
    runAt: runAt?.toISOString(),
    when: cron ? describeCron(cron, tz) : `Once, ${formatWhen(runAt, tz)}`,
    assumptions: [
      ...assumptions,
      ...(mode === "agent" ? ["Each run uses the firm model and can wake the GPU."] : ["A reminder posts your note. It does not wake the firm model."]),
    ],
  };
}

/** Plain-language "when" for the edit field: "weekdays at 7am", "tomorrow 9", "every monday". */
export function parseWhen(raw: string, opts: ParseOptions = {}): { cron?: string; runAt?: string; when: string } | null {
  const tz = opts.timezone || DEFAULT_TZ;
  const now = opts.now || new Date();
  const text = String(raw || "").trim();
  if (!text) return null;
  if (/^[\d*,/-]+(\s+[\d*,/a-z-]+){4}$/i.test(text) && validateCron(text, tz).ok) return { cron: text, when: describeCron(text, tz) };
  const sched = scheduleFrom(text, now, tz);
  if (!sched) return null;
  if (sched.cron) {
    if (!validateCron(sched.cron, tz).ok) return null;
    return { cron: sched.cron, when: describeCron(sched.cron, tz) };
  }
  if (sched.runAt) return { runAt: sched.runAt.toISOString(), when: `Once, ${formatWhen(sched.runAt, tz)}` };
  return null;
}
