import { ragIngest } from "./adapters.ts";
import { refreshAccess } from "./connectors.ts";
import { passageFilename, saveLibraryPassage, type PassageInput } from "./library-passages.ts";
import { findFilesByName, persistUpload } from "./store.ts";

const FRONTIER = /api\.openai\.com|api\.anthropic\.com/;

async function googleJson<T>(token: string, url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

async function graphJson<T>(token: string, path: string): Promise<T | null> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

function textOf(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 4000);
}

async function gmailText(token: string, id: string): Promise<{ subject: string; from: string; body: string }> {
  const data = await googleJson<{
    snippet?: string;
    payload?: { headers?: { name: string; value: string }[]; mimeType?: string; body?: { data?: string }; parts?: { mimeType?: string; body?: { data?: string } }[] };
  }>(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
  const headers = data?.payload?.headers || [];
  const subject = headers.find((header) => header.name.toLowerCase() === "subject")?.value || "Message";
  const from = headers.find((header) => header.name.toLowerCase() === "from")?.value || "";
  const encoded = data?.payload?.parts?.find((part) => part.mimeType === "text/plain")?.body?.data || data?.payload?.body?.data || "";
  let body = data?.snippet || "";
  if (encoded) {
    try {
      body = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    } catch {
      body = data?.snippet || body;
    }
  }
  return { subject, from, body: textOf(body) };
}

export async function pullGoogle(token: string, email: string): Promise<PassageInput[]> {
  const passages: PassageInput[] = [];
  const list = await googleJson<{ messages?: { id: string }[] }>(token, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8");
  for (const message of list?.messages || []) {
    const mail = await gmailText(token, message.id);
    passages.push({
      id: `gmail-${message.id}`.toLowerCase(),
      title: mail.subject,
      source: "Gmail",
      text: `From: ${mail.from}\nAccount: ${email}\n\n${mail.body}`,
    });
  }
  const drive = await googleJson<{ files?: { id: string; name: string; mimeType?: string }[] }>(
    token,
    "https://www.googleapis.com/drive/v3/files?pageSize=8&fields=files(id,name,mimeType)&q=" + encodeURIComponent("trashed = false"),
  );
  for (const file of drive?.files || []) {
    let body = `File: ${file.name}\nIndexed from Google Drive for ${email}.`;
    if (file.mimeType === "application/vnd.google-apps.document") {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) body = textOf(await res.text());
    }
    passages.push({ id: `gdrive-${file.id}`.toLowerCase(), title: file.name || "Drive file", source: "Google Drive", text: body });
  }
  const events = await googleJson<{ items?: { id?: string; summary?: string; start?: { dateTime?: string; date?: string } }[] }>(
    token,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=8&singleEvents=true&orderBy=startTime&timeMin=" + encodeURIComponent(new Date().toISOString()),
  );
  for (const event of events?.items || []) {
    const when = event.start?.dateTime || event.start?.date || "";
    passages.push({
      id: `gcal-${event.id || when}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      title: event.summary || "Calendar event",
      source: "Google Calendar",
      text: `${event.summary || "Event"}\nWhen: ${when}\nAccount: ${email}`,
    });
  }
  return passages;
}

export async function pullMicrosoft(token: string, email: string): Promise<PassageInput[]> {
  const passages: PassageInput[] = [];
  const mail = await graphJson<{ value?: { id?: string; subject?: string; bodyPreview?: string; from?: { emailAddress?: { address?: string } } }[] }>(
    token,
    "/me/messages?$top=8&$select=id,subject,bodyPreview,from",
  );
  for (const message of mail?.value || []) {
    passages.push({
      id: `outlook-${message.id || message.subject || "mail"}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 70),
      title: message.subject || "Outlook message",
      source: "Outlook",
      text: `From: ${message.from?.emailAddress?.address || ""}\nAccount: ${email}\n\n${textOf(message.bodyPreview || "")}`,
    });
  }
  const files = await graphJson<{ value?: { id?: string; name?: string }[] }>(token, "/me/drive/root/children?$top=8&$select=id,name,file");
  for (const file of files?.value || []) {
    passages.push({
      id: `onedrive-${file.id || file.name || "file"}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 70),
      title: file.name || "OneDrive file",
      source: "OneDrive",
      text: `File: ${file.name || "OneDrive file"}\nAccount: ${email}\nIndexed from OneDrive. The bytes stay on your firm’s host.`,
    });
  }
  const events = await graphJson<{ value?: { id?: string; subject?: string; start?: { dateTime?: string } }[] }>(
    token,
    "/me/events?$top=8&$select=id,subject,start&$orderby=start/dateTime",
  );
  for (const event of events?.value || []) {
    passages.push({
      id: `outlook-cal-${event.id || event.subject || "event"}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 70),
      title: event.subject || "Outlook event",
      source: "Outlook Calendar",
      text: `${event.subject || "Event"}\nWhen: ${event.start?.dateTime || ""}\nAccount: ${email}`,
    });
  }
  return passages;
}

export async function syncConnector(scope: string, kind: "google" | "microsoft", departmentId: string) {
  if (FRONTIER.test(`${kind}`)) throw new Error("Refusing a frontier destination.");
  const accounts = await refreshAccess(scope, kind);
  if (!accounts.length) throw new Error(kind === "google" ? "Google is not connected." : "Microsoft 365 is not connected.");
  let saved = 0;
  for (const account of accounts) {
    const passages = kind === "google" ? await pullGoogle(account.accessToken, account.email || account.id) : await pullMicrosoft(account.accessToken, account.email || account.id);
    for (const passage of passages) {
      await saveLibraryPassage(scope, passage);
      const filename = passageFilename(passage.id);
      const already = findFilesByName(filename).some((file) => file.name === filename);
      if (!already) {
        const written = persistUpload({
          departmentId,
          filename,
          body: Buffer.from(`# ${passage.title}\n\n${passage.text}`, "utf8"),
          inLibrary: true,
          origin: "drive",
        });
        if (!written.error) {
          await ragIngest(written.file.name);
          saved += 1;
        }
      } else {
        saved += 1;
      }
    }
  }
  return { saved, accounts: accounts.length };
}
