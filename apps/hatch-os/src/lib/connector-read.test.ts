import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGmailFallbackQueries,
  decodeBase64Url,
  extractGmailPayload,
  extractSearchTerms,
  formatGmailThread,
  formatOutlookMessages,
  stripHtmlToText,
} from "./connector-read.ts";
import fs from "node:fs";
import { connectorSchemas } from "./tools.ts";

function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

test("extractSearchTerms & buildGmailFallbackQueries handle natural-language briefing queries", () => {
  const q = "Can you get up to speed on the monument sign for boundaries little elm";
  const terms = extractSearchTerms(q);
  assert.deepEqual(terms, ["monument", "sign", "boundaries", "little", "elm"]);
  const fallbacks = buildGmailFallbackQueries(q);
  assert.equal(fallbacks[0], q);
  assert.ok(fallbacks.some((item) => item === "monument sign boundaries little elm"));
  assert.ok(fallbacks.some((item) => item.includes(" OR ")));
});

test("extractGmailPayload decodes nested multipart text/plain, falls back to stripped HTML, and collects attachment names", () => {
  const payload = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          {
            mimeType: "text/plain",
            body: {
              data: b64url("City of Little Elm approved the variance on Nov 18. Waiting on vendor final shop drawing."),
            },
          },
          {
            mimeType: "text/html",
            body: {
              data: b64url("<p>HTML version</p>"),
            },
          },
        ],
      },
      {
        mimeType: "application/pdf",
        filename: "Little-Elm-Monument-Sign-Permit-Rev3.pdf",
        body: { size: 42100 },
      },
      {
        mimeType: "image/png",
        filename: "Elevation-Rendering-v2.png",
        body: { size: 120000 },
      },
    ],
  };

  const extracted = extractGmailPayload(payload);
  assert.match(extracted.body, /City of Little Elm approved the variance on Nov 18/);
  assert.deepEqual(extracted.attachments, [
    "Little-Elm-Monument-Sign-Permit-Rev3.pdf",
    "Elevation-Rendering-v2.png",
  ]);
});

test("stripHtmlToText removes style/script tags and preserves line structure", () => {
  const clean = stripHtmlToText(
    "<html><head><style>.x{color:red}</style></head><body><p>Hello&nbsp;team,</p><p>Quote is $18,450 &amp; timeline is 4 weeks.</p></body></html>",
  );
  assert.equal(clean, "Hello team,\nQuote is $18,450 & timeline is 4 weeks.");
});

test("formatGmailThread preserves all messages, dates, participants, attachment names, and bodies", () => {
  const formatted = formatGmailThread({
    id: "thread-monument-1",
    messages: [
      {
        id: "m1",
        payload: {
          headers: [
            { name: "Subject", value: "Boundaries Little Elm - Monument Sign Quote" },
            { name: "From", value: "Apex Signs <quotes@apexsigns.example>" },
            { name: "To", value: "Daniel <daniel@example.com>" },
            { name: "Date", value: "Mon, 16 Nov 2026 10:12:00 -0600" },
          ],
          mimeType: "text/plain",
          body: { data: b64url("Attached is Quote #4419 for $18,450. Electrical feed needs confirmation.") },
        },
      },
      {
        id: "m2",
        payload: {
          mimeType: "multipart/mixed",
          headers: [
            { name: "Subject", value: "Re: Boundaries Little Elm - Monument Sign Quote" },
            { name: "From", value: "City Planning <permits@littleelm.example>" },
            { name: "To", value: "Daniel <daniel@example.com>" },
            { name: "Date", value: "Wed, 18 Nov 2026 15:40:00 -0600" },
          ],
          parts: [
            {
              mimeType: "text/html",
              body: {
                data: b64url("<div>Variance approved! Waiting on revised footing stamped PDF from Apex Signs before issuing permit.</div>"),
              },
            },
            {
              mimeType: "application/pdf",
              filename: "Little-Elm-Variance-Approval.pdf",
            },
          ],
        },
      },
    ],
  });

  assert.equal(formatted.messageCount, 2);
  assert.match(formatted.summary, /Boundaries Little Elm - Monument Sign Quote/);
  assert.match(formatted.text, /threadId: thread-monument-1/);
  assert.match(formatted.text, /Quote #4419 for \$18,450/);
  assert.match(formatted.text, /Variance approved! Waiting on revised footing stamped PDF/);
  assert.match(formatted.text, /Little-Elm-Variance-Approval\.pdf/);
  assert.match(formatted.text, /permits@littleelm\.example/);
});

test("formatOutlookMessages extracts full HTML-stripped message bodies", () => {
  const out = formatOutlookMessages([
    {
      subject: "Monument Sign Footer",
      receivedDateTime: "2026-11-20T14:00:00Z",
      from: { emailAddress: { name: "Alex", address: "alex@example.com" } },
      body: { contentType: "html", content: "<p>Concrete pour scheduled for Dec 2.</p>" },
      hasAttachments: true,
    },
  ]);
  assert.match(out.summary, /Monument Sign Footer/);
  assert.match(out.text, /Concrete pour scheduled for Dec 2\./);
  assert.match(out.text, /Has attachments: yes/);
});

test("connectorSchemas & buildAgentMessages instruct full body reading and concrete synthesis", () => {
  const schemas = connectorSchemas(new Set(["google"]));
  const emailSearch = schemas.find((t) => t.function.name === "email_search");
  const emailRead = schemas.find((t) => t.function.name === "email_read");
  assert.ok(emailSearch?.function.description.includes("full message bodies"));
  assert.ok(emailRead?.function.parameters.properties.threadId);

  const promptSource = fs.readFileSync(new URL("./prompt.ts", import.meta.url), "utf8");
  assert.match(promptSource, /read the FULL bodies of the top relevant email threads/i);
  assert.match(promptSource, /Never ask the user to clarify when relevant information is already in the messages/i);
});

test("decodeBase64Url handles missing or empty payloads safely", () => {
  assert.equal(decodeBase64Url(undefined), "");
  assert.equal(decodeBase64Url(""), "");
});
