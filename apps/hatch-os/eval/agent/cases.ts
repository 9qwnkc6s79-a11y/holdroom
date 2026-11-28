/**
 * ~20 realistic, sloppy asks, scored against the FICTIONAL fixtures in fixtures.ts.
 * `facts` are regexes the answer must contain to count as concrete and correct.
 */
export interface EvalCase {
  id: string;
  query: string;
  history?: { role: "user" | "assistant"; text: string }[];
  /** Should Hatch use tools at all? */
  needsTools: boolean;
  /** Facts a good answer states (regex, case-insensitive). */
  facts: string[];
  /** Things a good answer must NOT say. */
  forbid?: string[];
  /** Sources a good answer should mention (subject / file name fragments). */
  cite?: string[];
  /** For "nothing exists" cases: the answer should say it found nothing. */
  expectNotFound?: boolean;
  /** Pick for the small live run. */
  live?: boolean;
}

const SIGN_HISTORY = [
  { role: "user" as const, text: "get up to speed on the monument sign for boundaries little elm" },
  { role: "assistant" as const, text: "Bottom line: Rick sent proof v3 at $19,250 and needs approval plus a $9,625 deposit by Nov 28; the Town wants a setback site plan and utility locate." },
];

export const CASES: EvalCase[] = [
  { id: "sign-status", live: true, query: "get up to speed on the monument sign for boundaries little elm", needsTools: true,
    facts: ["19,?250", "v3|proof v3", "9,?625|deposit", "setback|site plan", "survey"], cite: ["monument sign", "SP-26-0412"] },
  { id: "sign-typo", query: "whats the deal w the monumnet sign", needsTools: true, facts: ["19,?250", "setback|survey"], cite: ["monument"] },
  { id: "rick-quote", live: true, query: "did rick send the new quote", needsTools: true, facts: ["19,?250", "rev ?3|v3|revised"], cite: ["quote|proof"] },
  { id: "town-needs", query: "what does the town need from us for the sign permit", needsTools: true, facts: ["15 ?ft|setback", "utility locate|811", "dec(ember)? 15|30 days"], cite: ["SP-26-0412|permit"] },
  { id: "landlord-followup", live: true, query: "what about the landlord?", history: SIGN_HISTORY, needsTools: true, facts: ["condition", "color"], cite: ["landlord"] },
  { id: "draft-rick", query: "draft a reply to rick approving v3", needsTools: true, facts: ["v3|proof", "deposit|9,?625"], forbid: ["\\bsent\\b(?! from)", "I have sent", "email has been sent"] },
  { id: "calendar-tmrw", query: "whats on my calendar tmrw", needsTools: true, facts: ["walkthrough", "maria|interview"] },
  { id: "insurance-due", query: "when's the insurance renewal due", needsTools: true, facts: ["dec(ember)? 1", "nov(ember)? 26|signed renewal form|payroll"] },
  { id: "hire-status", query: "catch me up on the shift lead hire", needsTools: true, facts: ["maria", "thursday|nov(ember)? 26|2 ?pm", "19"] },
  { id: "heaters", query: "any news on patio heaters for prosper", needsTools: true, facts: ["dec(ember)? 3", "dec(ember)? 5|dec(ember)? 8"] },
  { id: "haiku", live: true, query: "write a haiku about cold brew", needsTools: false, facts: [] },
  { id: "math", query: "whats 18% of 19250", needsTools: false, facts: [] },
  { id: "remember", query: "remember that Rick Delgado is our sign vendor at Lone Star Sign Co", needsTools: false, facts: ["remember|got it|noted"] },
  { id: "sign-sloppy", query: "sign stuff - where are we", needsTools: true, facts: ["19,?250|v3", "setback|survey|permit"] },
  { id: "quote-pdf", query: "pull up the sign quote pdf", needsTools: true, facts: ["4471|rev ?3", "19,?250"], cite: ["Quote_LoneStar"] },
  { id: "who-waiting", live: true, query: "who is waiting on who for the sign", needsTools: true, facts: ["survey", "approv|deposit"] },
  { id: "town-heard", query: "did we ever hear back from the town", needsTools: true, facts: ["nov(ember)? 15|review comments|alicia|planner", "setback|utility"] },
  { id: "week-le", query: "lmk what i missed this week on little elm", needsTools: true, facts: ["setback|survey|planner|maria|shift lead"] },
  { id: "deposit", query: "how much is the deposit for the sign", needsTools: true, facts: ["9,?625"] },
  { id: "espresso", query: "is the espresso machine fixed at prosper", needsTools: true, facts: ["back in service|replaced|fixed", "burr|grinder|410"] },
  { id: "menu-board", query: "status on the drive thru menu board", needsTools: true, facts: [], expectNotFound: true,
    forbid: ["\\$\\d", "ordered", "ships"] },
  { id: "math-plus", query: "what's 2 plus 2", needsTools: false, facts: ["4"] },
  { id: "casual-slang", query: "Lol what is pussified nation?", needsTools: false, facts: [], forbid: ["Coffee for the office", "roastery"] },
  { id: "missing-phrase", query: "did anyone email about pussified nation?", needsTools: true, facts: [], expectNotFound: true, forbid: ["Coffee for the office", "seasonal roast"] },
  { id: "fitness-standards", query: "what is my status with the standards? What do I have left to submit?", needsTools: true, facts: ["swim", "push-?ups"],
    forbid: ["The Keenes", "complete", "nothing left", "no further submissions"], cite: ["DA Fitness Standards"] },
  { id: "social-black-friday", query: "what did we decide for black friday on the social calendar?", needsTools: true, facts: ["download the app", "not run a discount|no.*discount"], cite: ["Social calendar"] },
  { id: "social-winter-board", query: "when did the winter board launch according to the social calendar", needsTools: true, facts: ["nov(?:ember)?\\s*13|2026-11-13"], cite: ["Social calendar"] },
  { id: "casual-thanks", query: "hey thanks!", needsTools: false, facts: [] },
  { id: "casual-advice", query: "yo whats a good rule of thumb for espresso extraction time?", needsTools: false, facts: [] },
  { id: "followup-anchor", query: "who is waiting on who with the sign again?", history: SIGN_HISTORY, needsTools: true,
    facts: ["survey|approv|deposit"], forbid: ["Brent", "Highpoint"] },
  // Harder sloppy asks: topic switches, short follow-ups, drafts that must not invent, not-found, schedule.
  { id: "switch-topic", query: "ok diff topic - is the espresso machine fixed at prosper", history: SIGN_HISTORY, needsTools: true,
    facts: ["burr|grinder|back in service|replaced"], forbid: ["19,?250", "setback"] },
  { id: "short-followup-due", query: "and when's that due", history: SIGN_HISTORY, needsTools: true, facts: ["nov(ember)? 28|fri"], forbid: ["Highpoint"] },
  { id: "short-followup-price", query: "how much again", history: SIGN_HISTORY, needsTools: true, facts: ["19,?250"] },
  { id: "draft-no-invent", query: "draft rick a short note saying we approve v3", needsTools: true, facts: ["v3|approv"],
    forbid: ["attached", "attaching", "enclosed", "I have sent", "meeting tomorrow"] },
  { id: "calendar-date", query: "anything on the cal dec 1", needsTools: true, facts: ["insurance|jordan"] },
  { id: "heaters-typo", query: "patio heatrs prosper??", needsTools: true, facts: ["dec(ember)? 3"] },
  { id: "insurance-sloppy", query: "insurance thing - whats due", needsTools: true, facts: ["dec(ember)? 1"] },
  { id: "notfound-zamboni", query: "whats the status of the zamboni rental for the holiday party", needsTools: true, facts: [], expectNotFound: true, forbid: ["\\$\\d", "confirmed"] },
  { id: "notfound-person", query: "did kevin from the bank email me", needsTools: true, facts: [], expectNotFound: true, forbid: ["kevin (said|wrote|sent)"] },
  { id: "casual-joke", query: "tell me a quick coffee joke", needsTools: false, facts: [] },
];
