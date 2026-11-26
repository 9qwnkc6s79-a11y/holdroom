import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session-auth";
import { saveGmailDraft, sendGmailMessage } from "@/lib/connectors";
import { getThread, recordAuditEntry, replaceThreadMessage } from "@/lib/store";
import { ensureThreadScoped, saveThreadScoped } from "@/lib/thread-store";
import type { EmailDraftCard } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    threadId?: string;
    messageId?: string;
    action?: "send" | "save_draft" | "discard";
    to?: string;
    subject?: string;
    body?: string;
    draft?: Partial<EmailDraftCard>;
  } | null;

  if (!body?.action || !["send", "save_draft", "discard"].includes(body.action)) {
    return NextResponse.json({ error: "Choose send, save_draft, or discard." }, { status: 400 });
  }

  const threadId = (body.threadId || "").trim();
  const messageId = (body.messageId || "").trim();
  if (threadId) {
    await ensureThreadScoped(auth.session.scope, threadId);
  }
  const thread = threadId ? getThread(threadId) : null;
  const existingMsg = thread?.messages.find((m) => m.id === messageId);
  const baseDraft: EmailDraftCard = existingMsg?.emailDraft || {
    id: body.draft?.id || messageId || `draft-${Date.now().toString(36)}`,
    to: body.draft?.to || "",
    subject: body.draft?.subject || "",
    body: body.draft?.body || "",
    threadRef: body.draft?.threadRef,
    gmailThreadId: body.draft?.gmailThreadId,
    accountEmail: body.draft?.accountEmail,
    inReplyTo: body.draft?.inReplyTo,
    references: body.draft?.references,
    status: "draft",
  };

  const to = (body.to ?? baseDraft.to ?? "").trim();
  const subject = (body.subject ?? baseDraft.subject ?? "").trim();
  const textBody = (body.body ?? baseDraft.body ?? "").trim();

  if (body.action === "discard") {
    const nextDraft: EmailDraftCard = {
      ...baseDraft,
      to,
      subject,
      body: textBody,
      status: "discarded",
      statusNote: "Draft discarded.",
    };
    if (thread && existingMsg) {
      const updated = { ...existingMsg, emailDraft: nextDraft };
      replaceThreadMessage(thread.id, updated);
      await saveThreadScoped(auth.session.scope, getThread(thread.id));
    }
    recordAuditEntry({ name: "email_draft_discard", ok: true, detail: `Discarded draft to ${to || "(no recipient)"}` });
    return NextResponse.json({ ok: true, emailDraft: nextDraft });
  }

  if (body.action === "save_draft") {
    const saved = await saveGmailDraft(auth.session.scope, {
      to,
      subject,
      body: textBody,
      accountEmail: baseDraft.accountEmail,
      threadRef: baseDraft.threadRef,
      gmailThreadId: baseDraft.gmailThreadId,
      inReplyTo: baseDraft.inReplyTo,
      references: baseDraft.references,
    });
    if (!saved.ok) {
      recordAuditEntry({ name: "email_draft_save", ok: false, detail: saved.error || "Could not save draft." });
      return NextResponse.json(
        { error: saved.error || "Could not save draft.", needsReconnect: Boolean(saved.needsReconnect) },
        { status: saved.needsReconnect ? 403 : 400 },
      );
    }
    const nextDraft: EmailDraftCard = {
      ...baseDraft,
      to,
      subject,
      body: textBody,
      accountEmail: saved.accountEmail || baseDraft.accountEmail,
      status: "saved",
      gmailDraftId: saved.draftId,
      statusNote: saved.accountEmail ? `Saved to ${saved.accountEmail} Gmail drafts.` : "Saved to Gmail drafts.",
    };
    if (thread && existingMsg) {
      const updated = { ...existingMsg, emailDraft: nextDraft };
      replaceThreadMessage(thread.id, updated);
      await saveThreadScoped(auth.session.scope, getThread(thread.id));
    }
    recordAuditEntry({ name: "email_draft_save", ok: true, detail: nextDraft.statusNote || "Saved Gmail draft" });
    return NextResponse.json({ ok: true, emailDraft: nextDraft });
  }

  // action === "send"
  const sent = await sendGmailMessage(auth.session.scope, {
    to,
    subject,
    body: textBody,
    accountEmail: baseDraft.accountEmail,
    threadRef: baseDraft.threadRef,
    gmailThreadId: baseDraft.gmailThreadId,
    inReplyTo: baseDraft.inReplyTo,
    references: baseDraft.references,
  });
  if (!sent.ok) {
    recordAuditEntry({ name: "email_send", ok: false, detail: sent.error || "Could not send email." });
    return NextResponse.json(
      { error: sent.error || "Could not send email.", needsReconnect: Boolean(sent.needsReconnect) },
      { status: sent.needsReconnect ? 403 : 400 },
    );
  }
  const nextDraft: EmailDraftCard = {
    ...baseDraft,
    to,
    subject,
    body: textBody,
    accountEmail: sent.accountEmail || baseDraft.accountEmail,
    gmailThreadId: sent.threadId || baseDraft.gmailThreadId,
    status: "sent",
    sentMessageId: sent.id,
    statusNote: sent.accountEmail ? `Sent from ${sent.accountEmail}.` : "Email sent.",
  };
  if (thread && existingMsg) {
    const updated = { ...existingMsg, emailDraft: nextDraft };
    replaceThreadMessage(thread.id, updated);
    await saveThreadScoped(auth.session.scope, getThread(thread.id));
  }
  recordAuditEntry({ name: "email_send", ok: true, detail: `Sent to ${to}: ${subject}` });
  return NextResponse.json({ ok: true, emailDraft: nextDraft });
}
