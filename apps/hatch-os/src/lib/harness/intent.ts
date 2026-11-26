/**
 * Intent + query expansion. Runs before any model call and costs nothing.
 *
 * Turns "get up to speed on the monument sign for boundaries little elm" into:
 *   kind=status_brief, sources=[mail, files, library],
 *   queries=['"monument sign" "little elm"', 'monument sign little elm', 'monument OR signage ...'].
 */
import { matchEntities, normalize, rememberRequest, type EntityMatch, type FirmMemory } from "./memory.ts";

export type IntentKind = "remember" | "status_brief" | "find" | "draft_reply" | "schedule" | "chat";
export type SourceKind = "mail" | "files" | "calendar" | "library";

export interface Intent {
  kind: IntentKind;
  needsTools: boolean;
  /** Ordered: the first source is searched first. */
  sources: SourceKind[];
  entities: EntityMatch[];
  /** Content words, filler removed. */
  terms: string[];
  /** Multi-word phrases worth quoting. */
  phrases: string[];
  /** Search queries, strict first. The harness falls back down this list on empty results. */
  queries: string[];
  /** A broader query to widen a status search that came back thin (topic words only). */
  widenQuery?: string;
  /** Gmail-style date filter, e.g. "newer_than:7d". */
  timeFilter?: string;
  /** What the final answer should look like. */
  answerShape: string;
  /** For "remember" intents. */
  fact?: string;
  /** Inclusive YYYY-MM-DD range for calendar asks ("tmrw", "this week"). */
  dateRange?: { from: string; to: string };
  /** True when the ask leaned on earlier turns ("what about the permit?"). */
  followUp: boolean;
}

const FILLER = [
  /\bget (?:me )?up to speed (?:on|with)\b/g,
  /\bcatch me up (?:on|with)?\b/g,
  /\bbring me up to speed (?:on|with)?\b/g,
  /\bwhats? (?:the )?(?:deal|story|status|latest|update) (?:with|on)\b/g,
  /\bwhere (?:are we|do we stand|does it stand|is it) (?:at )?(?:on|with)?\b/g,
  /\bwhat(?:s| is) going on with\b/g,
  /\bcan you\b|\bcould you\b|\bplease\b|\bpls\b|\bplz\b|\blmk\b|\bthx\b|\bthanks\b/g,
];

const STOP = new Set(
  (
    "a an the and or but for of on in at to from with by about into over is are was were be been being am do does did done have has had " +
    "i me my mine we us our ours you your it its this that these those there here what whats which who whom whose when where why how " +
    "get got give tell show find look see check pull up speed catch latest recent update updates status summary summarize sum brief " +
    "anything something everything all any some info information stuff thing things deal story going on " +
    "email emails mail mails inbox gmail outlook thread threads message messages drive file files doc docs document documents folder " +
    "cal cals gcal ical calendar meeting meetings event events schedule agenda itinerary just really kind sort quick quickly need want know think like can could would should will " +
    "hey hi hello yo ok okay so then also again now today yesterday tomorrow tmrw tmr week month year last next this past new " +
    "current present existing ongoing active follow following followup up waiting left remaining submit submitted submission submitting register registered decide decided decision according " +
    "send sent sending say said saying draft reply respond write wrote tell told ask asked w re regarding wrt " +
    "pdf docx xlsx csv news approving approve approved fixed done ready due back hear heard ever missed happen happened happening going where wheres whos when whens much many still yet"
  ).split(/\s+/),
);

/** Words that are content-bearing but too generic to search alone. */
const WEAK = new Set(["sign", "project", "job", "site", "plan", "plans", "work", "call", "note", "notes", "cost", "price", "quote"]);

const SYNONYMS: Record<string, string[]> = {
  sign: ["signage"],
  signage: ["sign"],
  permit: ["permitting", "approval"],
  quote: ["estimate", "bid", "proposal"],
  estimate: ["quote", "bid"],
  invoice: ["bill", "payment"],
  contract: ["agreement"],
  lease: ["rent"],
  install: ["installation"],
  drawings: ["plans", "renderings"],
};

export function analyzeIntent(
  query: string,
  opts: { memory?: FirmMemory | null; connected?: Set<string>; history?: { role: string; text: string }[]; todayIso?: string } = {},
): Intent {
  const raw = String(query || "").trim();
  const lower = normalize(raw);
  const connected = opts.connected || new Set<string>();
  const hasMail = ["email", "google", "microsoft"].some((k) => connected.has(k));
  const hasFiles = ["google", "microsoft"].some((k) => connected.has(k));
  const hasCalendar = hasFiles;

  const fact = rememberRequest(raw);
  if (fact) {
    return {
      kind: "remember", needsTools: false, sources: [], entities: [], terms: [], phrases: [], queries: [],
      answerShape: "Confirm in one short sentence what you will remember.", fact, followUp: false,
    };
  }

  const driveCalendar = /\b(?:social|content|editorial|marketing|posting|campaign|promo|holiday)(?:\s+media)?\s+calendar\b/.test(lower);
  let kind: IntentKind = "chat";
  if (/\b(up to speed|catch me up|status|where (are|do) we|where.*stand|what'?s? (going on|happening|the latest|new)|latest on|update on|any (news|word|update)|recap|summar|brief me|rundown|lowdown|progress)\b/.test(lower)) kind = "status_brief";
  else if (/\b(draft|write|reply|respond|follow up|followup|send)\b.{0,40}\b(email|reply|response|note|him|her|them|back)\b/.test(lower) || /^(reply|respond)\b/.test(lower)) kind = "draft_reply";
  else if (!driveCalendar && /\b(cal|calendar|schedule|meeting|meetings|appointment|free|busy|available|availability|when am i|whats on|what's on)\b/.test(lower)) kind = "schedule";
  else if (driveCalendar || /\b(find|where is|wheres|look up|lookup|pull up|did .{1,30} (send|say|reply|email)|what did|who (sent|said|is)|do (i|we) have|search|dig up|locate|the (pdf|doc|contract|quote|invoice|email|file))\b/.test(lower)) kind = "find";

  const entities = matchEntities(raw, opts.memory);

  let stripped = lower;
  for (const re of FILLER) stripped = stripped.replace(re, " ");
  let tokens = stripped.split(/\s+/).filter((t) => t && !STOP.has(t) && t.length > 1 && !/^\d{1,2}$/.test(t));

  // Follow-up: "what about the permit?" or "who is waiting on who with the sign again?" leans on the previous turn.
  let followUp = false;
  let newTerms: string[] = [];
  const prevUser = [...(opts.history || [])].reverse().find((turn) => turn.role === "user");
  const pronounish = /\b(it|that|this|them|those|the same|what about|how about|and the|also|again|still|waiting on|who'?s waiting|who is waiting|the (?:sign|quote|thread|email|mail|message|file|doc|project|permit|proposal|estimate|draft|one))\b/.test(lower);
  const prevEntities = prevUser ? matchEntities(prevUser.text, opts.memory) : [];
  const introducesNewEntity = entities.some((e) => !prevEntities.some((pe) => pe.name === e.name));
  if (prevUser && pronounish && !introducesNewEntity && tokens.length <= 3 && kind !== "schedule") {
    const prev = analyzeIntent(prevUser.text, { memory: opts.memory, connected });
    if (prev.needsTools) {
      followUp = true;
      newTerms = [...tokens];
      tokens = [...new Set([...prev.terms, ...tokens])];
      entities.push(...prev.entities.filter((e) => !entities.some((x) => x.name === e.name)));
      if (kind === "chat") kind = prev.kind === "remember" ? "find" : prev.kind;
    }
  }

  // Default to looking things up for work asks; keep math, creative, and casual banter/general asks as plain chat.
  const mathExpr = /^(?:what(?:'s| is)\s+)?-?\d+(?:\.\d+)?(?:\s*(?:plus|minus|times|multiplied by|divided by|over|\+|-|\*|x|\/)\s*-?\d+(?:\.\d+)?)+\s*\??$/i.test(raw);
  const mentionsSource = /\b(email|emails|mail|inbox|gmail|outlook|drive|onedrive|doc|docs|file|files|pdf|spreadsheet|sheet|calendar|cal|meeting)\b/.test(lower);
  const ownershipSignal = /\b(my|our|we|us|firm|company|boundaries|little elm|prosper|celina|frisco|grand prairie|mcdermott|tapmango|tacos y rocky|onyx|cintas|twc|1120|hatch os)\b/.test(lower);
  const generalAdvice = /\b(rule of thumb|best practice|general rule|typically|in general|how do i make|how to make)\b/.test(lower) && !ownershipSignal && !mentionsSource && entities.length === 0;
  const workSignal =
    !generalAdvice &&
    (entities.length > 0 ||
      mentionsSource ||
      /\b(my|our|we|us|firm|company|store|shop|cafe|coffee|client|vendor|quote|proposal|estimate|invoice|bill|contract|lease|permit|sign|signage|project|job|site|plan|plans|deadline|due|submit|submission|standard|standards|schedule|meeting|call|calendar|patio|heater|heaters|espresso machine|roast|barista|payroll|tax|insurance|account)\b/.test(lower));
  const casualGreeting = /^(?:hey|hi|hello|yo|sup|thanks|thank you|thx|ok|okay|cool|nice|great|awesome|sounds good|got it|good morning|good afternoon|good evening|how are you|whats up|what's up)[!.,?\s]*$/i.test(lower);
  const casualQuestion =
    !workSignal &&
    (/^(?:lol|haha|lmao|lmfao|wtf|bruh|bro|wait|yo)\b/i.test(lower) ||
      /^(?:what(?:'s| is)(?: a| an| the)?|who(?:'s| is)|why(?: is| are)?|how(?: does| do| to)?)\b/.test(lower));
  const general =
    mathExpr ||
    generalAdvice ||
    casualGreeting ||
    casualQuestion ||
    /\b(haiku|poem|limerick|joke|song|story|riddle|translate|definition|define|synonym|explain (how|what|why)|what is an? |who was|capital of)\b|\d+(\.\d+)?\s*%\s*of\s*\d|^[\d\s+\-*\/x%().,=?]+$|\b(hi|hello|hey|thanks|thank you)\W*$/i.test(raw);
  if (kind === "chat" && !general && tokens.length && (hasMail || hasFiles)) kind = "find";
  if (kind === "chat" && !mathExpr && (entities.length || mentionsSource) && tokens.length) kind = entities.some((e) => e.kind === "project") ? "status_brief" : "find";

  // Canonical spelling: a typo that fuzzy-matched firm memory searches with the real words.
  for (const entity of entities) {
    const typed = entity.matched.split(" ");
    const real = entity.label.split(" ");
    if (typed.join(" ") === real.join(" ")) continue;
    const at = tokens.indexOf(typed.find((t) => tokens.includes(t)) || "");
    tokens = tokens.filter((t) => !typed.includes(t));
    const content = real.filter((t) => !STOP.has(t));
    tokens.splice(at < 0 ? tokens.length : Math.min(at, tokens.length), 0, ...content);
  }
  tokens = [...new Set(tokens)];

  // Phrases worth quoting: what matched firm memory (in canonical words), and
  // adjacent content words in the user's order when neither is a place/org word.
  const placeWords = new Set(entities.filter((e) => e.kind !== "project").flatMap((e) => e.label.split(" ")));
  const phrases: string[] = [];
  for (const entity of entities) {
    if (entity.kind === "person") continue;
    const label = entity.label.split(" ").filter((t) => !STOP.has(t)).join(" ");
    if (label.includes(" ")) phrases.push(label);
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (placeWords.has(a) || placeWords.has(b)) continue;
    if (!lower.includes(`${a} ${b}`)) continue;
    phrases.push(`${a} ${b}`);
  }
  const uniqPhrases = phrases.filter((p, i) => phrases.indexOf(p) === i).filter((p) => !phrases.some((q) => q !== p && q.includes(p)));

  const terms = tokens;
  const extras = [...new Set(entities.flatMap((e) => e.keywords.map(normalize)).filter(Boolean))];
  const personWords = new Set(entities.filter((e) => e.kind === "person").flatMap((e) => e.label.split(" ")));
  const topic = terms.filter((t) => !placeWords.has(t) && !personWords.has(t));
  const strong = topic.filter((t) => !WEAK.has(t));

  const queries: string[] = [];
  const quote = (p: string) => (p.includes(" ") ? `"${p}"` : p);
  if (uniqPhrases.length) {
    const covered = new Set(uniqPhrases.flatMap((p) => p.split(" ")));
    queries.push([...uniqPhrases.slice(0, 3).map(quote), ...terms.filter((t) => !covered.has(t)).slice(0, 3)].join(" "));
  }
  if (terms.length) queries.push(terms.slice(0, 6).join(" "));
  // Topic only, without the place/person words: "monument sign".
  if (topic.length && topic.length < terms.length) queries.push(topic.slice(0, 4).join(" "));
  const broad = [...new Set([...strong.slice(0, 3), ...strong.flatMap((t) => SYNONYMS[t] || []).slice(0, 2), ...extras.slice(0, 2), ...topic.filter((t) => WEAK.has(t)).flatMap((t) => SYNONYMS[t] || []).slice(0, 1)])];
  if (broad.length > 1) queries.push(broad.join(" OR "));
  else if (broad.length === 1) queries.push(broad[0]);
  const topicQuery = topic.length && topic.length < terms.length ? topic.slice(0, 4).join(" ") : broad.length > 1 ? broad.join(" OR ") : undefined;
  if (kind === "draft_reply") {
    const person = entities.find((e) => e.kind === "person" && e.email);
    if (person) queries.splice(Math.min(1, queries.length), 0, `from:${person.email} OR to:${person.email}`);
  }
  if (followUp && newTerms.length) {
    const anchor = uniqPhrases[0] ? quote(uniqPhrases[0]) : "";
    queries.unshift(newTerms.join(" "));
    if (anchor) queries.unshift(`${anchor} ${newTerms.join(" ")}`);
  }
  for (const entity of entities) {
    if (entity.kind === "person" && entity.email) {
      const rest = topic.slice(0, 3).join(" ");
      queries.splice(Math.min(1, queries.length), 0, `(from:${entity.email} OR to:${entity.email})${rest ? ` ${rest}` : ""}`);
      queries.push(`from:${entity.email} OR to:${entity.email}`);
    }
  }

  let timeFilter: string | undefined;
  if (/\b(today)\b/.test(lower)) timeFilter = "newer_than:1d";
  else if (/\b(yesterday|tmrw|tomorrow|tmr)\b/.test(lower) && kind !== "schedule") timeFilter = "newer_than:2d";
  else if (/\b(this week|past week|last week|lately|recently)\b/.test(lower)) timeFilter = "newer_than:8d";
  else if (/\b(this month|last month|past month)\b/.test(lower)) timeFilter = "newer_than:32d";

  let sources: SourceKind[] = [];
  const wantsFiles = driveCalendar || /\b(drive|onedrive|doc|docs|document|file|files|pdf|spreadsheet|sheet|deck|contract|drawing|drawings|rendering|proof|plans)\b/.test(lower);
  const wantsMail = /\b(email|emails|mail|inbox|gmail|outlook|said|say|sent|send|reply|replied|wrote|heard)\b/.test(lower);
  if (kind === "status_brief") sources = ["mail", "files", "library"];
  else if (kind === "find") sources = wantsFiles && !wantsMail ? ["files", "library", "mail"] : ["mail", "files", "library"];
  else if (kind === "draft_reply") sources = ["mail", "library"];
  else if (kind === "schedule") sources = ["calendar", ...(entities.some((e) => e.kind === "person") ? (["mail"] as SourceKind[]) : [])];
  const ambiguousOrTimed = /\b(meeting|call|walkthrough|install|deadline|due|submit|submission)\b/.test(lower) || (!entities.length && terms.length <= 2);
  if ((kind === "status_brief" || kind === "find") && ambiguousOrTimed && !sources.includes("calendar")) sources.push("calendar");
  sources = sources.filter((s) => (s === "mail" ? hasMail : s === "files" ? hasFiles : s === "calendar" ? hasCalendar : true));

  const needsTools = kind !== "chat" && (sources.length > 0 || kind === "draft_reply");

  const answerShape =
    kind === "status_brief"
      ? "A status briefing: one-line 'Bottom line:' first (where it stands), then short bullets or sections ONLY for items with real facts (e.g. Latest, Who is waiting on whom, Key dates & numbers, Next steps). Omit empty sections. Cite sources with clickable markdown links [Title](url) using exact URLs from the evidence."
      : kind === "find"
        ? "Answer directly and concisely in 1-3 short sentences or bullets. Do NOT use a 'Bottom line:' header or status-briefing template. Cite the source with a clickable markdown link [Title](url) when a URL is in the evidence."
        : kind === "draft_reply"
          ? "Call email_draft with to, subject, body, and thread_ref grounded in the thread. Output no commentary before or after."
          : kind === "schedule"
            ? "Lead directly with the events as a clean list (time - title - who) and note any conflicts. Do NOT use a status-briefing template. Include clickable markdown links [Title](url) when provided."
            : "Reply naturally in 1-3 short sentences (or just the direct answer for math/thanks). No preamble, no briefing template, no bullet list unless needed.";

  let dateRange: Intent["dateRange"];
  if (opts.todayIso && /^\d{4}-\d{2}-\d{2}$/.test(opts.todayIso)) {
    const base = new Date(`${opts.todayIso}T12:00:00Z`);
    const day = (n: number) => new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10);
    if (/\b(tmrw|tmr|tomorrow)\b/.test(lower)) dateRange = { from: day(1), to: day(1) };
    else if (/\btoday\b/.test(lower)) dateRange = { from: day(0), to: day(0) };
    else if (/\bnext week\b/.test(lower)) dateRange = { from: day(7 - base.getUTCDay() + 1), to: day(7 - base.getUTCDay() + 7) };
    else if (/\bthis week\b/.test(lower) && kind === "schedule") dateRange = { from: day(0), to: day(6 - base.getUTCDay() + 1) };
  }

  return { kind, needsTools, sources, dateRange, widenQuery: followUp ? newTerms.join(" ") || topicQuery : topicQuery, entities, terms, phrases: uniqPhrases, queries: [...new Set(queries)].filter(Boolean).slice(0, 5), timeFilter, answerShape, followUp };
}
