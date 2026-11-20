import { adminAuthorized, adminConfigured, bodyError, clientIp, json, readJson, sameSite } from "../../lib/http.js";
import { deleteRecord, listRecords, rateLimit, readRecord, saveRecord } from "../../lib/store.js";
import { isRequestId, parseStatusPatch } from "../../lib/validate.js";

async function gate(request) {
  if (!sameSite(request)) return json({ ok: false, error: "Forbidden." }, 403);
  if (!adminConfigured()) return json({ ok: false, error: "Admin access is not configured." }, 503);
  const limited = await rateLimit("admin", clientIp(request), 40, 15 * 60 * 1000);
  if (limited) return json({ ok: false, error: "Too many attempts. Try again later." }, 429);
  if (!adminAuthorized(request)) return json({ ok: false, error: "That code is not valid." }, 401);
  return null;
}

export default {
  async fetch(request) {
    const denied = await gate(request);
    if (denied) return denied;

    try {
      if (request.method === "GET") {
        const requests = await listRecords();
        return json({ ok: true, requests });
      }

      if (request.method === "PATCH") {
        const body = await readJson(request);
        const parsed = parseStatusPatch(body);
        if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
        const current = await readRecord(parsed.value.id);
        if (!current) return json({ ok: false, error: "That request is no longer in the queue." }, 404);
        const updated = {
          ...current,
          status: parsed.value.status,
          assignedCode: parsed.value.assignedCode,
          updatedAt: new Date().toISOString(),
        };
        await saveRecord(updated);
        console.error("request updated", updated.id, updated.status);
        return json({ ok: true, request: updated });
      }

      if (request.method === "DELETE") {
        const body = await readJson(request);
        const id = body && body.id;
        if (!isRequestId(id)) return json({ ok: false, error: "Unknown request." }, 400);
        await deleteRecord(id);
        console.error("request removed", id);
        return json({ ok: true });
      }

      return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "GET, PATCH, DELETE" });
    } catch (error) {
      const known = bodyError(error);
      if (known) return known;
      console.error("admin request failed", error && error.message);
      return json({ ok: false, error: "The request queue could not be reached." }, 503);
    }
  },
};
