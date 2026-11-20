import { randomUUID } from "node:crypto";
import { bodyError, clientIp, clip, json, readJson, sameSite } from "../lib/http.js";
import { rateLimit, saveRecord } from "../lib/store.js";
import { parseInquiry } from "../lib/validate.js";

export default {
  async fetch(request) {
    if (!sameSite(request)) return json({ ok: false, error: "Forbidden." }, 403);
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    try {
      const body = await readJson(request);
      const parsed = parseInquiry(body);
      if (parsed.spam) {
        await rateLimit("inquire", clientIp(request), 8, 60 * 60 * 1000);
        return json({ ok: true });
      }
      if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
      const limited = await rateLimit("inquire", clientIp(request), 8, 60 * 60 * 1000);
      if (limited) return json({ ok: false, error: "Too many requests. Try again later." }, 429);

      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        createdAt: now,
        requestType: parsed.value.requestType,
        name: parsed.value.name,
        email: parsed.value.email,
        firm: parsed.value.firm,
        role: parsed.value.role,
        firmSize: parsed.value.firmSize,
        notes: parsed.value.notes,
        status: "pending",
        assignedCode: null,
        updatedAt: now,
        userAgent: clip(request.headers.get("user-agent"), 180),
        referer: clip(request.headers.get("referer"), 300),
      };
      await saveRecord(record);
      console.error("request stored", record.id, record.requestType);
      return json({ ok: true });
    } catch (error) {
      const known = bodyError(error);
      if (known) return known;
      console.error("request save failed", error && error.message);
      return json({ ok: false, error: "We could not save your request. Please try again shortly." }, 503);
    }
  },
};
