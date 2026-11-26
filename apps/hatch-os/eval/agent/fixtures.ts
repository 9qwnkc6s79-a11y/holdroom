/**
 * EVAL FIXTURES — FICTIONAL DATA.
 *
 * Every email, file, event, person, company, amount and date below is made up
 * for testing the Hatch agent. None of it is real correspondence. Addresses use
 * the reserved .test domain. "Boundaries Little Elm" is used only as a realistic
 * project label; the contents are invented.
 */

export interface FixtureMessage {
  from: string;
  to: string;
  date: string; // ISO
  body: string;
  attachments?: string[];
}

export interface FixtureThread {
  id: string;
  subject: string;
  messages: FixtureMessage[];
}

export interface FixtureFile {
  id: string;
  name: string;
  modified: string;
  text: string;
}

export interface FixtureEvent {
  id: string;
  title: string;
  start: string;
  attendees?: string[];
  notes?: string;
}

export const FIXTURE_TODAY = "2026-11-25";

export const THREADS: FixtureThread[] = [
  {
    id: "t-sign-proof",
    subject: "Little Elm monument sign – revised proof v3 [FIXTURE]",
    messages: [
      {
        from: "Rick Delgado <rick@lonestarsign.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-10-28T15:10:00-05:00",
        body: "Hi Daniel, attached is proof v2 for the Boundaries Little Elm monument sign. Double-sided, 8 ft wide x 6 ft tall, illuminated cabinet on a masonry base. Quote stands at $18,400 installed. Let me know on the logo size.",
        attachments: ["LE_monument_proof_v2.pdf"],
      },
      {
        from: "Daniel Keene <daniel@hatch-fixture.test>",
        to: "rick@lonestarsign.test",
        date: "2026-11-04T09:02:00-06:00",
        body: "Rick, looks good. Can we make the logo about 20% larger and switch the base to the stone veneer we talked about? Otherwise approved in concept.\n\nOn Oct 28, 2026, Rick Delgado wrote:\n> Hi Daniel, attached is proof v2...",
      },
      {
        from: "Rick Delgado <rick@lonestarsign.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-12T16:45:00-06:00",
        body: "Here is proof v3 with the larger logo and stone veneer base. The veneer adds $850, so the revised quote is $19,250 installed. To hold the January install slot I need your signed approval on v3 and the 50% deposit ($9,625) by Friday, Nov 28. I submitted the sign permit application to the Town of Little Elm on Nov 10 (application SP-26-0412).",
        attachments: ["LE_monument_proof_v3.pdf", "Quote_LoneStar_4471_rev3.pdf"],
      },
      {
        from: "Rick Delgado <rick@lonestarsign.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-19T11:20:00-06:00",
        body: "Quick update: the Town's planner came back on SP-26-0412. They need a site plan showing the 15 ft setback from the property line and a utility locate before they will approve. I can draw the setback, but I need the property survey from you. Can you send it over?",
      },
    ],
  },
  {
    id: "t-town-permit",
    subject: "SP-26-0412 Monument sign permit – review comments [FIXTURE]",
    messages: [
      {
        from: "Alicia Moreno, Planning <amoreno@townoflittleelm-fixture.test>",
        to: "rick@lonestarsign.test; daniel@hatch-fixture.test",
        date: "2026-11-15T10:05:00-06:00",
        body: "Good morning. Review comments for SP-26-0412 (monument sign, 2650 Main St): 1) Provide a dimensioned site plan showing the sign at least 15 ft from the property line. 2) Provide a utility locate (811 ticket) for the footing. 3) Maximum height in this district is 6 ft, which the proof meets. Resubmit within 30 days to keep the application active (by Dec 15, 2026).",
      },
    ],
  },
  {
    id: "t-landlord",
    subject: "Re: Little Elm – landlord sign approval [FIXTURE]",
    messages: [
      {
        from: "Priya Shah <pshah@mainstreetretail.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-10T14:30:00-06:00",
        body: "Daniel, ownership approves the monument sign location conditionally. Final approval needs the final color samples (cabinet and veneer) before fabrication. Please send them when you have them.",
      },
    ],
  },
  {
    id: "t-newsletter",
    subject: "Sign up now: Retail signage webinar [FIXTURE]",
    messages: [
      {
        from: "Events <news@signexpo.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-20T08:00:00-06:00",
        body: "Sign up for our free webinar on retail signage trends. Unsubscribe anytime.",
      },
    ],
  },
  {
    id: "t-heaters",
    subject: "Prosper patio heaters – PO 5520 [FIXTURE]",
    messages: [
      {
        from: "Dana Ortiz <dana@patiopro.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-18T13:00:00-06:00",
        body: "PO 5520 confirmed for four patio heaters for Prosper, $3,240 total, 50% deposit received. Ship date is Dec 3. Our installer can do Dec 5 or Dec 8; tell me which.",
      },
    ],
  },
  {
    id: "t-espresso",
    subject: "Prosper espresso machine service ticket 8812 [FIXTURE]",
    messages: [
      {
        from: "Service Desk <service@brewtech.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-21T09:40:00-06:00",
        body: "Ticket 8812: the tech replaced the group head gasket and steam valve on the Prosper espresso machine on Nov 21. Machine is back in service. One follow-up: the grinder burrs are worn and should be replaced within 2 weeks (quote $410).",
      },
    ],
  },
  {
    id: "t-insurance",
    subject: "Policy renewal – action needed by Dec 1 [FIXTURE]",
    messages: [
      {
        from: "Jordan Lee <jlee@northstarins.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-17T12:00:00-06:00",
        body: "Hi Daniel, your general liability and property policy renews Dec 1. Renewal premium is $6,980, up 4% from last year. I need the signed renewal form and updated payroll estimate by Nov 26 to bind on time.",
        attachments: ["Renewal_form_2027.pdf"],
      },
    ],
  },
  {
    id: "t-hire",
    subject: "Shift lead candidate – Maria Lopez [FIXTURE]",
    messages: [
      {
        from: "Sam Carter <sam@hatch-fixture.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-20T17:15:00-06:00",
        body: "Maria Lopez (shift lead, Little Elm) passed the phone screen. Second interview with you is Thursday Nov 26 at 2 pm. She can start Dec 8 and asked for $19/hr; our range is $17-19.",
      },
    ],
  },
  {
    id: "t-highpoint",
    subject: "Boundaries Coffee Signage – Highpoint intro [FIXTURE]",
    messages: [
      {
        from: "Brent Henley <brent@highpointsigns.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-16T11:00:00-06:00",
        body: "Hi Daniel, following up on Boundaries Little Elm signage options if you still need another bid.",
      },
    ],
  },
  {
    id: "t-coffee-office",
    subject: "Coffee for the office [FIXTURE]",
    messages: [
      {
        from: "Roastery Ops <roastery@hatch-fixture.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-18T09:00:00-06:00",
        body: "Across the nation our new seasonal roast is getting great reviews. Let's keep two bags at the office.",
      },
    ],
  },
  {
    id: "t-pies",
    subject: "Thanksgiving pie catering order [FIXTURE]",
    messages: [
      {
        from: "Lena Brooks <lena@fixture-hoa.test>",
        to: "daniel@hatch-fixture.test",
        date: "2026-11-22T10:00:00-06:00",
        body: "Confirming 40 coffee carafes and 12 pies for pickup Wednesday Nov 25 at 3 pm. Invoice to the HOA.",
      },
    ],
  },
];

export const FILES: FixtureFile[] = [
  {
    id: "f-quote",
    name: "Quote_LoneStar_4471_rev3.pdf [FIXTURE]",
    modified: "2026-11-12",
    text: "Lone Star Sign Co. Quote 4471 rev 3. Boundaries Little Elm monument sign, double-sided illuminated cabinet, stone veneer base. Fabrication $15,900. Install $2,500. Stone veneer upgrade $850. Total $19,250. Terms: 50% deposit ($9,625) to schedule, balance on completion. Quote valid through Dec 12, 2026.",
  },
  {
    id: "f-survey",
    name: "Little Elm site survey 2025.pdf [FIXTURE]",
    modified: "2025-06-02",
    text: "Boundary survey, 2650 Main St, Little Elm. Prepared June 2025. Shows property line along Main St and existing utility easement 10 ft from curb.",
  },
  {
    id: "f-holiday",
    name: "Holiday hours 2026.docx [FIXTURE]",
    modified: "2026-11-01",
    text: "Thanksgiving Day: closed. Black Friday: 7am-2pm. Christmas Eve: 6am-noon.",
  },
  {
    id: "f-social",
    name: "Social calendar Aug 27 2026–Feb 15 2027 [FIXTURE]",
    modified: "2026-11-24",
    text: "2026-11-13,Friday,Reel,Winter Board Launch,Launch reel for Winter Board menu (Nov 13).\n2026-11-27,Friday,Static,Black Friday Promo,Do NOT run a discount on Black Friday — CTA is download the app for double points on your next visit.",
  },
  {
    id: "f-fitness",
    name: "DA Fitness Standards [FIXTURE]",
    modified: "2026-11-25",
    text: "2026 Fitness Standards. All members must register scores before Thanksgiving. Keene: Tier 3 Minimum FALSE — remaining items: 200m swim, 40 push-ups.",
  },
];

export const EVENTS: FixtureEvent[] = [
  { id: "e1", title: "Sign walkthrough with Rick – Little Elm [FIXTURE]", start: "2026-11-26T10:00:00-06:00", attendees: ["rick@lonestarsign.test"] },
  { id: "e2", title: "Interview – Maria Lopez (shift lead) [FIXTURE]", start: "2026-11-26T14:00:00-06:00", attendees: ["sam@hatch-fixture.test"] },
  { id: "e3", title: "Insurance renewal call – Jordan [FIXTURE]", start: "2026-12-01T09:00:00-06:00" },
];

export const LIBRARY: { title: string; source: string; text: string }[] = [
  { title: "Brand guide – colors [FIXTURE]", source: "Library", text: "Primary brand colors: deep green #1F4D3A and cream #F3EDE2. Signage uses the stacked logo." },
  { title: "Vendor list [FIXTURE]", source: "Library", text: "Signage: Lone Star Sign Co (Rick Delgado). Patio: PatioPro (Dana Ortiz). Insurance: Northstar (Jordan Lee)." },
  {
    title: "The Keenes: A Family History from Plymouth to Texas [FIXTURE]",
    source: "Library",
    text: ("Early generations of the Keene family migrated from Plymouth to Texas across several decades of frontier life. ".repeat(14)) +
      "They held themselves to high standards of community and family stewardship.",
  },
];

export const FIXTURE_MEMORY = {
  version: 1 as const,
  firmName: "Boundaries Coffee (fixture)",
  user: { name: "Daniel", role: "owner" },
  people: [
    { name: "Rick Delgado", role: "sign vendor", org: "Lone Star Sign Co", email: "rick@lonestarsign.test" },
    { name: "Priya Shah", role: "landlord rep", email: "pshah@mainstreetretail.test" },
    { name: "Jordan Lee", role: "insurance agent", email: "jlee@northstarins.test" },
  ],
  projects: [
    { name: "Little Elm monument sign", aliases: ["monument sign", "the sign", "sign"], keywords: ["SP-26-0412", "Lone Star"], place: "Little Elm" },
  ],
  places: [{ name: "Little Elm", aliases: ["LE", "lil elm"] }, { name: "Prosper" }],
  preferences: ["Keep answers short and skimmable."],
  facts: [],
};
