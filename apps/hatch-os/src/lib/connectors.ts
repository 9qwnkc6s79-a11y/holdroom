import { createHmac, randomBytes } from "node:crypto";
import { deleteRecord, readRecords, saveRecord } from "./beta-store.ts";
import { decryptJson, encryptJson, vaultConfigured, vaultKey } from "./vault-crypto.ts";
import { checkImap, checkSmtp, imapSearch, smtpSend, type MailAccount } from "./mail-probe.ts";
import { safeCode } from "./testers.ts";
import type { ToolEvent } from "./types.ts";
import {
  buildGmailFallbackQueries,
  extractPdfTextLite,
  extractSearchTerms,
  formatGmailThread,
  formatOutlookMessages,
  type GmailThread,
  type OutlookMessage,
} from "./connector-read.ts";

export const BETA_ORIGIN = "https://hatch-os-beta.vercel.app";

export type ConnectorKind = "google" | "microsoft" | "email" | "slack" | "notion" | "github" | "linear" | "mcp";

export interface ConnectorPublic {
  id: string;
  kind: ConnectorKind;
  label: string;
  detail: string;
  connectedAt: string;
}

interface StoredConnector extends ConnectorPublic {
  scope: string;
  secret: { iv: string; tag: string; ciphertext: string };
}

export interface ConnectorCatalogItem {
  kind: ConnectorKind;
  name: string;
  blurb: string;
  auth: string;
}

/** Google scopes for Gmail read/draft/send, Drive read, Calendar read, and openid/email labeling. */
export const GOOGLE_OAUTH_SCOPE =
  "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.readonly";

/** Read-only Microsoft scopes. User.Read labels the account. Tenant is `common` (no tenant env var). */
export const MICROSOFT_OAUTH_SCOPE = "offline_access User.Read Mail.Read Files.Read.All Calendars.Read";

/** App scheme the iPhone waits on. Google and Microsoft never see this URL. */
export const IOS_OAUTH_RETURN = "hatchos://oauth";

export function accountId(kind: string, label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${kind}--${slug || "account"}`;
}

export const CONNECTOR_CATALOG: ConnectorCatalogItem[] = [
  { kind: "google", name: "Google", blurb: "Gmail, Calendar, and Drive", auth: "OAuth" },
  { kind: "microsoft", name: "Microsoft 365", blurb: "Outlook mail, calendar, and OneDrive", auth: "OAuth" },
  { kind: "email", name: "Email", blurb: "IMAP and SMTP, including Gmail and Outlook app passwords", auth: "Password" },
  { kind: "slack", name: "Slack", blurb: "Channels and messages", auth: "OAuth or token" },
  { kind: "notion", name: "Notion", blurb: "Pages in a workspace", auth: "Token or OAuth" },
  { kind: "github", name: "GitHub", blurb: "Repos and issues", auth: "Token" },
  { kind: "linear", name: "Linear", blurb: "Issues", auth: "API key" },
  { kind: "mcp", name: "Custom MCP", blurb: "A remote tool server", auth: "URL" },
];

export const MAIL_PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
  gmail: { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 587 },
  outlook: { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 },
  fastmail: { imapHost: "imap.fastmail.com", imapPort: 993, smtpHost: "smtp.fastmail.com", smtpPort: 587 },
};

export function callbackUrl(kind: "google" | "microsoft" | "slack" | "notion", origin = BETA_ORIGIN) {
  return `${origin.replace(/\/$/, "")}/api/connectors/${kind}/callback`;
}

export function oauthConfigured(kind: "google" | "microsoft" | "slack" | "notion") {
  const map = {
    google: ["HATCH_GOOGLE_CLIENT_ID", "HATCH_GOOGLE_CLIENT_SECRET"],
    microsoft: ["HATCH_MICROSOFT_CLIENT_ID", "HATCH_MICROSOFT_CLIENT_SECRET"],
    slack: ["HATCH_SLACK_CLIENT_ID", "HATCH_SLACK_CLIENT_SECRET"],
    notion: ["HATCH_NOTION_CLIENT_ID", "HATCH_NOTION_CLIENT_SECRET"],
  } as const;
  return map[kind].every((name) => Boolean((process.env[name] || "").trim()));
}

export function scopeKey(scope: string) {
  return safeCode(scope || "staff") || "staff";
}

function folder(scope: string) {
  return `connectors/${scopeKey(scope)}`;
}

function publicOf(row: StoredConnector): ConnectorPublic {
  return { id: row.id, kind: row.kind, label: row.label, detail: row.detail, connectedAt: row.connectedAt };
}

export async function listConnectors(scope: string): Promise<ConnectorPublic[]> {
  const rows = await readRecords<StoredConnector>(folder(scope));
  return rows.filter((row) => row.kind).map(publicOf);
}

async function readSecret<T>(scope: string, kind: ConnectorKind): Promise<{ row: StoredConnector; secret: T } | null> {
  const rows = await readRecords<StoredConnector>(folder(scope));
  const row = rows.find((item) => item.kind === kind || item.id === kind);
  if (!row?.secret) return null;
  return { row, secret: decryptJson<T>(row.secret) };
}

export async function disconnectConnector(scope: string, kindOrId: string) {
  const rows = await readRecords<StoredConnector>(folder(scope));
  const matches = rows.filter((row) => row.id === kindOrId || row.kind === kindOrId);
  if (!matches.length) {
    await deleteRecord(folder(scope), kindOrId);
    return;
  }
  for (const row of matches) await deleteRecord(folder(scope), row.id);
}

async function saveConnector(scope: string, kind: ConnectorKind, label: string, detail: string, secret: unknown, id = accountId(kind, label)) {
  if (!vaultConfigured()) throw new Error("Encrypted storage is not configured on this system.");
  const existing = (await readRecords<StoredConnector>(folder(scope))).find((row) => row.id === id);
  const row: StoredConnector = {
    id,
    kind,
    scope: scopeKey(scope),
    label: label.slice(0, 120),
    detail: detail.slice(0, 240),
    connectedAt: existing?.connectedAt || new Date().toISOString(),
    secret: encryptJson(secret),
  };
  await saveRecord(folder(scope), id, row);
  return publicOf(row);
}

export async function connectEmail(scope: string, input: MailAccount) {
  const imap = await checkImap(input);
  const smtp = await checkSmtp(input);
  return saveConnector(scope, "email", input.email, `${imap} ${smtp}`, {
    email: input.email,
    password: input.password,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
  });
}

async function slackAuthTest(token: string) {
  const res = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { ok?: boolean; team?: string; user?: string; error?: string };
  if (!data.ok) throw new Error(data.error || "Slack rejected that token.");
  return data;
}

export async function connectSlackToken(scope: string, token: string) {
  const auth = await slackAuthTest(token);
  return saveConnector(scope, "slack", auth.team || "Slack", auth.user || "Connected", { token });
}

export async function connectNotionToken(scope: string, token: string) {
  const res = await fetch("https://api.notion.com/v1/users/me", {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
  });
  const data = (await res.json().catch(() => null)) as { name?: string; bot?: { owner?: { user?: { name?: string } } }; message?: string } | null;
  if (!res.ok) throw new Error(data?.message || "Notion rejected that token.");
  const label = data?.name || data?.bot?.owner?.user?.name || "Notion";
  return saveConnector(scope, "notion", label, "Integration token verified", { token });
}

export async function connectGithubToken(scope: string, token: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Hatch-OS" },
  });
  const data = (await res.json().catch(() => null)) as { login?: string; message?: string } | null;
  if (!res.ok || !data?.login) throw new Error(data?.message || "GitHub rejected that token.");
  return saveConnector(scope, "github", data.login, "Token verified", { token });
}

export async function connectLinearKey(scope: string, token: string) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ viewer { id name email } }" }),
  });
  const data = (await res.json().catch(() => null)) as { data?: { viewer?: { name?: string; email?: string } }; errors?: { message: string }[] } | null;
  const viewer = data?.data?.viewer;
  if (!res.ok || !viewer) throw new Error(data?.errors?.[0]?.message || "Linear rejected that key.");
  return saveConnector(scope, "linear", viewer.name || viewer.email || "Linear", "API key verified", { token });
}

export async function connectMcp(scope: string, url: string, token?: string) {
  const listed = await mcpRequest(url, token, "tools/list", {});
  const tools = Array.isArray((listed as { tools?: unknown }).tools) ? (listed as { tools: { name: string }[] }).tools : [];
  const names = tools.map((tool) => tool.name).filter(Boolean).slice(0, 40);
  return saveConnector(scope, "mcp", new URL(url).host, names.length ? names.join(", ") : "No tools advertised", {
    url,
    token: token || "",
    tools: names,
  });
}

async function mcpRequest(url: string, token: string | undefined, method: string, params: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = (await res.json().catch(() => null)) as { result?: unknown; error?: { message?: string } } | null;
  if (!res.ok || data?.error) throw new Error(data?.error?.message || "The MCP server rejected the call.");
  return data?.result ?? {};
}

export function signState(payload: Record<string, string>) {
  const body = Buffer.from(JSON.stringify({ ...payload, n: randomBytes(8).toString("hex") })).toString("base64url");
  const mac = createHmac("sha256", vaultKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readState(token: string) {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expect = createHmac("sha256", vaultKey()).update(body).digest("base64url");
  if (expect !== mac) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { scope: string; kind: string; client?: string };
  } catch {
    return null;
  }
}

export async function saveOAuthAccount(scope: string, kind: ConnectorKind, label: string, secret: unknown) {
  return saveConnector(scope, kind, label, "OAuth connected", secret);
}

type GoogleSecret = { accessToken: string; refreshToken?: string; expiresAt?: number; email?: string };

export interface AccessAccount {
  id: string;
  accessToken: string;
  email?: string;
}

export interface AccessError {
  label: string;
  reason: "decrypt" | "expired" | "timeout" | "http";
  needsReconnect?: boolean;
  message: string;
}

export async function refreshAccessStatus(
  scope: string,
  kind: "google" | "microsoft",
): Promise<{ accounts: AccessAccount[]; errors: AccessError[] }> {
  const rows = await readRecords<StoredConnector>(folder(scope));
  const matches = rows.filter((row) => row.kind === kind);
  const ready: AccessAccount[] = [];
  const errors: AccessError[] = [];
  const results = await Promise.all(
    matches.map(async (row) => {
      let secret: GoogleSecret;
      try {
        secret = decryptJson<GoogleSecret>(row.secret);
      } catch {
        return { error: { label: row.label, reason: "decrypt" as const, needsReconnect: true, message: `${row.label} credentials could not be read` } };
      }
      if (!secret.accessToken) {
        return { error: { label: row.label, reason: "expired" as const, needsReconnect: true, message: `${row.label} needs to be reconnected` } };
      }
      const refreshed = await refreshOAuthWithStatus(scope, row, secret, kind);
      if (refreshed.error) return { error: refreshed.error };
      if (refreshed.secret.accessToken) {
        return { account: { id: row.id, accessToken: refreshed.secret.accessToken, email: refreshed.secret.email || row.label } };
      }
      return {};
    }),
  );
  for (const item of results) {
    if (item.account) ready.push(item.account);
    if (item.error) errors.push(item.error);
  }
  return { accounts: ready, errors };
}

export async function refreshAccess(scope: string, kind: "google" | "microsoft"): Promise<AccessAccount[]> {
  const { accounts } = await refreshAccessStatus(scope, kind);
  return accounts;
}

async function refreshOAuthWithStatus(
  scope: string,
  row: StoredConnector,
  secret: GoogleSecret,
  kind: "google" | "microsoft",
): Promise<{ secret: GoogleSecret; error?: AccessError }> {
  if (secret.expiresAt && secret.expiresAt > Date.now() + 60_000) return { secret };
  if (!secret.refreshToken) {
    if (secret.expiresAt && secret.expiresAt <= Date.now()) {
      return { secret, error: { label: row.label, reason: "expired", needsReconnect: true, message: `${row.label} session expired` } };
    }
    return { secret };
  }
  const google = kind === "google";
  const body = new URLSearchParams({
    client_id: process.env[google ? "HATCH_GOOGLE_CLIENT_ID" : "HATCH_MICROSOFT_CLIENT_ID"] || "",
    client_secret: process.env[google ? "HATCH_GOOGLE_CLIENT_SECRET" : "HATCH_MICROSOFT_CLIENT_SECRET"] || "",
    refresh_token: secret.refreshToken,
    grant_type: "refresh_token",
  });
  if (!google) body.set("scope", MICROSOFT_OAUTH_SCOPE);
  const tokenUrl = google
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  let res: Response;
  try {
    res = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(8_000) });
  } catch (err) {
    const timedOut = err instanceof Error && /timeout|abort/i.test(err.name + " " + err.message);
    return { secret, error: { label: row.label, reason: timedOut ? "timeout" : "http", message: `${row.label} token refresh ${timedOut ? "timed out" : "failed"}` } };
  }
  const token = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string } | null;
  if (!res.ok || !token?.access_token) {
    const expired = secret.expiresAt ? secret.expiresAt <= Date.now() : true;
    const revoked = token?.error === "invalid_grant" || res.status === 400 || res.status === 401;
    if (expired || revoked) {
      return {
        secret,
        error: {
          label: row.label,
          reason: revoked ? "expired" : "http",
          needsReconnect: revoked,
          message: revoked ? `${row.label} needs to be reconnected in Settings` : `${row.label} auth returned HTTP ${res.status}`,
        },
      };
    }
    return { secret };
  }
  const next: GoogleSecret = {
    ...secret,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || secret.refreshToken,
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
  };
  await saveConnector(scope, kind, row.label, row.detail, next, row.id);
  return { secret: next };
}
type SlackSecret = { token: string };
type NotionSecret = { token: string };
type GithubSecret = { token: string };
type LinearSecret = { token: string };
type McpSecret = { url: string; token?: string; tools?: string[] };

async function graphGet(scope: string, path: string) {
  const accounts = await refreshAccess(scope, "microsoft");
  const token = accounts[0]?.accessToken;
  if (!token) return null;
  return fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

function tool(name: string, ok: boolean, detail: string, extra?: string): { event: ToolEvent; extra?: string } {
  return {
    event: { name, ok, detail: detail.slice(0, 500), input: detail.slice(0, 180) },
    extra: ok ? (extra ?? detail).slice(0, 16000) : undefined,
  };
}

const WRITE_TOOLS = new Set([
  "email_send",
  "calendar_create",
  "slack_post_message",
  "notion_create_page",
  "github_create_issue",
  "linear_create_issue",
]);

export function connectorToolNeedsApproval(name: string, args: Record<string, unknown>) {
  if (WRITE_TOOLS.has(name)) return true;
  if (name === "mcp_call") {
    const toolName = String(args.name || args.tool || "");
    return /create|send|post|update|delete|write|insert/i.test(toolName);
  }
  return false;
}

export async function runConnectorTool(
  scope: string,
  name: string,
  args: Record<string, string>,
  approved: boolean,
): Promise<{ event: ToolEvent; extra?: string }> {
  if (connectorToolNeedsApproval(name, args) && !approved) {
    return tool(name, false, "Waiting for approval. Nothing was sent.");
  }
  try {
    if (name === "email_search" || name === "email_read" || name === "email_draft" || name === "email_send") {
      return await runEmail(scope, name, args);
    }
    if (name === "calendar_list" || name === "calendar_create") return await runCalendar(scope, name, args);
    if (name === "cloud_files_search" || name === "cloud_files_read") return await runFiles(scope, name, args);
    if (name.startsWith("slack_")) return await runSlack(scope, name, args);
    if (name.startsWith("notion_")) return await runNotion(scope, name, args);
    if (name.startsWith("github_")) return await runGithub(scope, name, args);
    if (name.startsWith("linear_")) return await runLinear(scope, name, args);
    if (name === "mcp_call") return await runMcp(scope, args);
    return tool(name, false, "That connector tool is not available.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "The connector failed.";
    return tool(name, false, message.replace(/bearer\s+\S+/gi, "bearer ••••"));
  }
}

async function gmailApi(token: string, path: string) {
  return fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  });
}

async function readGoogleDriveText(token: string, file: { id: string; name: string; mimeType?: string; size?: string }): Promise<string> {
  const mime = (file.mimeType || "").toLowerCase();
  const headers = { Authorization: `Bearer ${token}` };
  let url = "";
  let mode: "text" | "pdf" | "none" = "none";
  if (mime === "application/vnd.google-apps.document" || mime === "application/vnd.google-apps.presentation") {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fplain`;
    mode = "text";
  } else if (mime === "application/vnd.google-apps.spreadsheet") {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fcsv`;
    mode = "text";
  } else if (mime.startsWith("text/") || mime === "application/json" || /\.(txt|md|markdown|csv|json)$/i.test(file.name)) {
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
    mode = "text";
  } else if (mime === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const bytes = Number(file.size || 0);
    if (!bytes || bytes <= 4_000_000) {
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
      mode = "pdf";
    }
  }
  if (!url || mode === "none") return "";
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return "";
    if (mode === "pdf") {
      const buf = Buffer.from(await res.arrayBuffer());
      return extractPdfTextLite(buf).slice(0, 4500);
    }
    return (await res.text()).replace(/\u0000/g, "").trim().slice(0, 4500);
  } catch {
    return "";
  }
}

async function runEmail(scope: string, name: string, args: Record<string, string>) {
  const mail = await readSecret<MailAccount>(scope, "email");
  const googleAccounts = await refreshAccess(scope, "google");
  if (name === "email_search" || name === "email_read") {
    const rawQuery = (args.query || args.q || args.subject || "").trim();
    const explicitThreadId = (args.threadId || args.thread_id || "").trim();
    if (googleAccounts.length) {
      const formattedThreads: { subject: string; messageCount: number; summary: string; text: string }[] = [];
      for (const account of googleAccounts.slice(0, 2)) {
        if (explicitThreadId) {
          const res = await gmailApi(account.accessToken, `/users/me/threads/${encodeURIComponent(explicitThreadId)}?format=full`);
          if (res.ok) {
            const thread = (await res.json().catch(() => null)) as GmailThread | null;
            if (thread?.messages?.length) {
              formattedThreads.push(formatGmailThread(thread, { maxTotalChars: 9000 }));
              break;
            }
          }
          continue;
        }
        const queries = buildGmailFallbackQueries(rawQuery);
        let threadIds: string[] = [];
        for (const q of queries.length ? queries : [""]) {
          const listPath = q
            ? `/users/me/threads?maxResults=5&q=${encodeURIComponent(q)}`
            : "/users/me/threads?maxResults=5";
          const res = await gmailApi(account.accessToken, listPath);
          const data = (await res.json().catch(() => null)) as { threads?: { id: string }[] } | null;
          if (data?.threads?.length) {
            threadIds = data.threads.map((t) => t.id).filter(Boolean);
            break;
          }
        }
        if (threadIds.length) {
          const fetched = await Promise.all(
            threadIds.slice(0, 3).map(async (id) => {
              const res = await gmailApi(account.accessToken, `/users/me/threads/${encodeURIComponent(id)}?format=full`);
              if (!res.ok) return null;
              return (await res.json().catch(() => null)) as GmailThread | null;
            }),
          );
          for (const thread of fetched) {
            if (thread?.messages?.length) {
              formattedThreads.push(formatGmailThread(thread, { maxTotalChars: 5500 }));
            }
          }
        }
      }
      if (formattedThreads.length) {
        const chip = `Gmail: ${formattedThreads.map((t) => t.summary).join(" · ")}`;
        const fullExtra = formattedThreads.map((t) => t.text).join("\n\n");
        return tool(name, true, chip, fullExtra);
      }
    }
    const outlook = await graphGet(
      scope,
      "/me/messages?$top=10&$select=id,conversationId,subject,body,bodyPreview,from,toRecipients,receivedDateTime,hasAttachments&$orderby=receivedDateTime%20desc",
    );
    if (outlook) {
      const data = (await outlook.json().catch(() => null)) as { value?: OutlookMessage[] } | null;
      const terms = extractSearchTerms(rawQuery);
      const qLower = rawQuery.toLowerCase();
      const rows = (data?.value || []).filter((item) => {
        if (!qLower) return true;
        const hay = `${item.subject || ""} ${item.bodyPreview || ""} ${item.body?.content || ""}`.toLowerCase();
        if (hay.includes(qLower)) return true;
        return terms.length ? terms.some((t) => hay.includes(t)) : true;
      });
      if (rows.length) {
        const formatted = formatOutlookMessages(rows.slice(0, 4));
        return tool(name, true, `Outlook: ${formatted.summary}`, formatted.text);
      }
    }
    if (!mail && !googleAccounts.length && !outlook) return tool(name, false, "Connect Email, Gmail, or Outlook first.");
    if (mail) {
      const text = await imapSearch(mail.secret, rawQuery);
      return tool(name, true, `Mail: ${rawQuery || "Inbox"} (${text.slice(0, 120).replace(/\s+/g, " ")})`, text);
    }
    return tool(name, true, "No mail matched.");
  }
  if (name === "email_draft") {
    await saveRecord(`connectors/${scopeKey(scope)}`, `draft-${Date.now().toString(36)}`, {
      to: args.to || "",
      subject: args.subject || "",
      body: (args.body || args.text || "").slice(0, 8000),
    });
    return tool(name, true, `Draft prepared to ${args.to || "(no recipient)"}: ${args.subject || "(no subject)"}. It was not sent.`);
  }
  if (!args.to || (!args.body && !args.text)) return tool(name, false, "A recipient and a message are required.");
  if (mail) {
    const sent = await smtpSend(mail.secret, { to: args.to, subject: args.subject || "(no subject)", body: args.body || args.text || "" });
    return tool(name, true, sent);
  }
  if (googleAccounts.length) return tool(name, false, "Gmail is connected read-only. Nothing was sent.");
  return tool(name, false, "Connect Email before sending. Gmail and Outlook on this host are read-only.");
}

async function runCalendar(scope: string, name: string, args: Record<string, string>) {
  const googleAccounts = await refreshAccess(scope, "google");
  if (name === "calendar_list") {
    if (googleAccounts[0]) {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=5&orderBy=startTime&singleEvents=true&timeMin=" + encodeURIComponent(new Date().toISOString()), {
        headers: { Authorization: `Bearer ${googleAccounts[0].accessToken}` },
      });
      const data = (await res.json().catch(() => null)) as { items?: { summary?: string; start?: { dateTime?: string } }[] } | null;
      const lines = (data?.items || []).map((item) => `${item.start?.dateTime || ""} ${item.summary || "Untitled"}`).join("\n");
      if (lines) return tool(name, res.ok, lines);
    }
    const outlook = await graphGet(scope, "/me/events?$top=5&$select=subject,start&$orderby=start/dateTime");
    const data = (await outlook?.json().catch(() => null)) as { value?: { subject?: string; start?: { dateTime?: string } }[] } | null;
    const lines = (data?.value || []).map((item) => `${item.start?.dateTime || ""} ${item.subject || "Untitled"}`).join("\n");
    if (!googleAccounts[0] && !outlook) return tool(name, false, "Connect Google Calendar or Outlook first.");
    return tool(name, true, lines || "No upcoming events.");
  }
  return tool(name, false, "Calendar is connected read-only. Nothing was created.");
}

async function runFiles(scope: string, name: string, args: Record<string, string>) {
  const googleAccounts = await refreshAccess(scope, "google");
  const rawQuery = (args.query || args.q || "").trim();
  const fileId = (args.fileId || args.file_id || "").trim();
  const cleanQ = rawQuery.replace(/'/g, "");
  if (googleAccounts.length) {
    const token = googleAccounts[0].accessToken;
    type DriveFileMeta = { id: string; name: string; mimeType?: string; modifiedTime?: string; size?: string; owners?: { displayName?: string; emailAddress?: string }[] };
    let files: DriveFileMeta[] = [];
    if (fileId) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,size,owners(displayName,emailAddress)`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
      );
      if (res.ok) {
        const single = (await res.json().catch(() => null)) as DriveFileMeta | null;
        if (single?.id) files = [single];
      }
    } else {
      const terms = extractSearchTerms(cleanQ).map((t) => t.replace(/'/g, "")).filter(Boolean);
      const candidates: string[] = [];
      if (cleanQ) {
        candidates.push(`trashed = false and (name contains '${cleanQ}' or fullText contains '${cleanQ}')`);
      }
      if (terms.length) {
        const orClauses = terms.slice(0, 5).map((t) => `name contains '${t}' or fullText contains '${t}'`).join(" or ");
        candidates.push(`trashed = false and (${orClauses})`);
      }
      if (!candidates.length) candidates.push("trashed = false");
      for (const qExpr of candidates) {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?pageSize=6&orderBy=modifiedTime%20desc&q=${encodeURIComponent(qExpr)}&fields=files(id,name,mimeType,modifiedTime,size,owners(displayName,emailAddress))`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
        );
        const data = (await res.json().catch(() => null)) as { files?: DriveFileMeta[] } | null;
        if (data?.files?.length) {
          files = data.files;
          break;
        }
      }
    }
    if (files.length) {
      const contents = await Promise.all(
        files.slice(0, 3).map(async (f) => ({
          file: f,
          text: await readGoogleDriveText(token, f),
        })),
      );
      const chip = `Drive: ${files.map((f) => f.name).join(" · ")}`;
      const extra = contents
        .map(({ file, text }) => {
          const owner = file.owners?.[0]?.displayName || file.owners?.[0]?.emailAddress || "";
          return [
            `=== Drive File: ${file.name} [fileId: ${file.id}] ===`,
            `Type: ${file.mimeType || "unknown"}${file.modifiedTime ? ` | Modified: ${file.modifiedTime}` : ""}${owner ? ` | Owner: ${owner}` : ""}`,
            text || "(binary/non-text file; metadata only)",
          ].join("\n");
        })
        .join("\n\n");
      return tool(name, true, chip, extra);
    }
  }
  const drive = await graphGet(
    scope,
    cleanQ
      ? `/me/drive/root/search(q='${encodeURIComponent(cleanQ)}')?$top=6&$select=id,name,size,lastModifiedDateTime,file`
      : "/me/drive/root/children?$top=8&$select=id,name,size,lastModifiedDateTime,file",
  );
  const data = (await drive?.json().catch(() => null)) as { value?: { id?: string; name?: string; lastModifiedDateTime?: string; file?: { mimeType?: string } }[] } | null;
  const terms = extractSearchTerms(cleanQ);
  const rows = (data?.value || []).filter((f) => {
    if (!cleanQ) return true;
    const hay = (f.name || "").toLowerCase();
    return hay.includes(cleanQ.toLowerCase()) || terms.some((t) => hay.includes(t));
  });
  if (rows.length) {
    const details = await Promise.all(
      rows.slice(0, 3).map(async (f) => {
        const mime = f.file?.mimeType || "";
        let text = "";
        if (f.id && (mime.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(f.name || ""))) {
          const r = await graphGet(scope, `/me/drive/items/${encodeURIComponent(f.id)}/content`);
          if (r?.ok) text = (await r.text()).slice(0, 4000);
        }
        return [
          `=== OneDrive File: ${f.name || "Untitled"}${f.lastModifiedDateTime ? ` | Modified: ${f.lastModifiedDateTime}` : ""} ===`,
          text || "(metadata only)",
        ].join("\n");
      }),
    );
    return tool(name, true, `OneDrive: ${rows.map((r) => r.name || "Untitled").join(" · ")}`, details.join("\n\n"));
  }
  if (!googleAccounts.length && !drive) return tool(name, false, "Connect Google Drive or OneDrive first.");
  return tool(name, true, "No files matched.");
}

async function runSlack(scope: string, name: string, args: Record<string, string>) {
  const saved = await readSecret<SlackSecret>(scope, "slack");
  if (!saved) return tool(name, false, "Connect Slack first.");
  const headers = { Authorization: `Bearer ${saved.secret.token}`, "Content-Type": "application/json" };
  if (name === "slack_list_channels") {
    const res = await fetch("https://slack.com/api/conversations.list?limit=10", { headers });
    const data = (await res.json()) as { ok?: boolean; channels?: { name: string }[]; error?: string };
    return tool(name, Boolean(data.ok), data.ok ? data.channels!.map((c) => c.name).join(", ") : data.error || "Slack list failed.");
  }
  if (name === "slack_read_messages") {
    const res = await fetch(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(args.channel || "")}&limit=5`, { headers });
    const data = (await res.json()) as { ok?: boolean; messages?: { text?: string }[]; error?: string };
    return tool(name, Boolean(data.ok), data.ok ? (data.messages || []).map((m) => m.text || "").join("\n") : data.error || "Slack read failed.");
  }
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers,
    body: JSON.stringify({ channel: args.channel, text: args.text }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return tool(name, Boolean(data.ok), data.ok ? `Posted to ${args.channel}.` : data.error || "Slack did not post.");
}

async function runNotion(scope: string, name: string, args: Record<string, string>) {
  const saved = await readSecret<NotionSecret>(scope, "notion");
  if (!saved) return tool(name, false, "Connect Notion first.");
  const headers = { Authorization: `Bearer ${saved.secret.token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
  if (name === "notion_search" || name === "notion_read_page") {
    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: args.query || "", page_size: 5 }),
    });
    const data = (await res.json().catch(() => null)) as { results?: { id: string }[] } | null;
    return tool(name, res.ok, (data?.results || []).map((row) => row.id).join("\n") || "No Notion pages matched.");
  }
  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { page_id: args.parentId },
      properties: { title: { title: [{ text: { content: args.title || "Hatch note" } }] } },
    }),
  });
  return tool(name, res.ok, res.ok ? `Created Notion page “${args.title || "Hatch note"}”.` : "Notion did not create that page.");
}

async function runGithub(scope: string, name: string, args: Record<string, string>) {
  const saved = await readSecret<GithubSecret>(scope, "github");
  if (!saved) return tool(name, false, "Connect GitHub first.");
  const headers = { Authorization: `Bearer ${saved.secret.token}`, Accept: "application/vnd.github+json", "User-Agent": "Hatch-OS" };
  if (name === "github_create_issue") {
    const res = await fetch(`https://api.github.com/repos/${args.repo}/issues`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: args.title, body: args.body || "" }),
    });
    const data = (await res.json().catch(() => null)) as { html_url?: string; message?: string } | null;
    return tool(name, res.ok, res.ok ? `Created ${data?.html_url || "an issue"}.` : data?.message || "GitHub did not create that issue.");
  }
  const res = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(args.query || "is:issue")}&per_page=5`, { headers });
  const data = (await res.json().catch(() => null)) as { items?: { title: string; html_url: string }[] } | null;
  return tool(name, res.ok, (data?.items || []).map((item) => `${item.title} ${item.html_url}`).join("\n") || "No GitHub issues matched.");
}

async function runLinear(scope: string, name: string, args: Record<string, string>) {
  const saved = await readSecret<LinearSecret>(scope, "linear");
  if (!saved) return tool(name, false, "Connect Linear first.");
  const creating = name === "linear_create_issue";
  const query = creating
    ? "mutation($title: String!, $desc: String) { issueCreate(input: { title: $title, description: $desc }) { success } }"
    : "query($q: String) { issues(first: 5, filter: { title: { contains: $q } }) { nodes { identifier title } } }";
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: saved.secret.token, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: creating ? { title: args.title || "Hatch issue", desc: args.body || "" } : { q: args.query || "" },
    }),
  });
  const data = (await res.json().catch(() => null)) as { data?: { issues?: { nodes?: { identifier: string; title: string }[] }; issueCreate?: { success?: boolean } } } | null;
  if (name === "linear_create_issue") return tool(name, Boolean(data?.data?.issueCreate?.success), data?.data?.issueCreate?.success ? `Created “${args.title}”.` : "Linear did not create that issue.");
  const nodes = data?.data?.issues?.nodes || [];
  return tool(name, res.ok, nodes.map((node) => `${node.identifier} ${node.title}`).join("\n") || "No Linear issues matched.");
}

async function runMcp(scope: string, args: Record<string, string>) {
  const saved = await readSecret<McpSecret>(scope, "mcp");
  if (!saved) return tool("mcp_call", false, "Connect a custom MCP server first.");
  const result = await mcpRequest(saved.secret.url, saved.secret.token, "tools/call", {
    name: args.name || args.tool,
    arguments: safeJson(args.arguments),
  });
  return tool("mcp_call", true, JSON.stringify(result).slice(0, 2000));
}

function safeJson(raw: string | undefined) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function testConnector(scope: string, kind: ConnectorKind) {
  if (kind === "email") {
    const mail = await readSecret<MailAccount>(scope, "email");
    if (!mail) throw new Error("Email is not connected.");
    return `${await checkImap(mail.secret)} ${await checkSmtp(mail.secret)}`;
  }
  if (kind === "slack") {
    const saved = await readSecret<SlackSecret>(scope, "slack");
    if (!saved) throw new Error("Slack is not connected.");
    const auth = await slackAuthTest(saved.secret.token);
    return `Slack token works for ${auth.team || "the workspace"}.`;
  }
  if (kind === "notion") {
    const saved = await readSecret<NotionSecret>(scope, "notion");
    if (!saved) throw new Error("Notion is not connected.");
    const res = await fetch("https://api.notion.com/v1/users/me", {
      headers: { Authorization: `Bearer ${saved.secret.token}`, "Notion-Version": "2022-06-28" },
    });
    if (!res.ok) throw new Error("Notion rejected the saved token.");
    return "Notion token works.";
  }
  if (kind === "github") {
    const saved = await readSecret<GithubSecret>(scope, "github");
    if (!saved) throw new Error("GitHub is not connected.");
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${saved.secret.token}`, "User-Agent": "Hatch-OS" },
    });
    if (!res.ok) throw new Error("GitHub rejected the saved token.");
    return "GitHub token works.";
  }
  if (kind === "linear") {
    const saved = await readSecret<LinearSecret>(scope, "linear");
    if (!saved) throw new Error("Linear is not connected.");
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: saved.secret.token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ viewer { id } }" }),
    });
    if (!res.ok) throw new Error("Linear rejected the saved key.");
    return "Linear key works.";
  }
  if (kind === "mcp") {
    const saved = await readSecret<McpSecret>(scope, "mcp");
    if (!saved) throw new Error("No MCP server is connected.");
    await mcpRequest(saved.secret.url, saved.secret.token, "tools/list", {});
    return "MCP server responded.";
  }
  const saved = await readSecret<GoogleSecret>(scope, kind);
  if (!saved) throw new Error("That app is not connected.");
  return `${kind} token is stored.`;
}


function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeRfc2822(opts: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}) {
  const headers = [
    `To: ${cleanHeader(opts.to)}`,
    `Subject: ${cleanHeader(opts.subject || "(no subject)")}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${cleanHeader(opts.inReplyTo)}`] : []),
    ...(opts.references ? [`References: ${cleanHeader(opts.references)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  const rawMessage = `${headers.join("\r\n")}\r\n\r\n${opts.body.replace(/\r?\n/g, "\r\n")}`;
  return Buffer.from(rawMessage, "utf8").toString("base64url");
}

function pickGoogleAccount<T extends { email?: string }>(
  accounts: T[],
  accountEmail?: string,
  threadRef?: string,
): T | undefined {
  if (!accounts.length) return undefined;
  if (accountEmail) {
    const match = accounts.find((a) => a.email && a.email.toLowerCase() === accountEmail.toLowerCase());
    if (match) return match;
  }
  const refMatch = threadRef ? /^g(\d+):/.exec(threadRef) : null;
  if (refMatch) {
    const idx = Number(refMatch[1]);
    if (accounts[idx]) return accounts[idx];
  }
  return accounts[0];
}

function parseGmailThreadId(gmailThreadId?: string, threadRef?: string) {
  if (gmailThreadId) return gmailThreadId.trim();
  const m = threadRef ? /^g\d+:([^\s]+)/.exec(threadRef) : null;
  return m ? m[1] : undefined;
}

export async function sendGmailMessage(
  scope: string,
  opts: {
    to: string;
    subject: string;
    body: string;
    accountEmail?: string;
    threadRef?: string;
    gmailThreadId?: string;
    inReplyTo?: string;
    references?: string;
  },
): Promise<{ ok: boolean; id?: string; threadId?: string; accountEmail?: string; error?: string; needsReconnect?: boolean }> {
  const to = cleanHeader(opts.to || "");
  if (!to) return { ok: false, error: "Add a recipient before sending." };
  if (!opts.body?.trim()) return { ok: false, error: "Write a message body before sending." };
  const accounts = await refreshAccess(scope, "google");
  const account = pickGoogleAccount(accounts, opts.accountEmail, opts.threadRef);
  if (!account) {
    const mail = await readSecret<MailAccount>(scope, "email");
    if (mail) {
      const sent = await smtpSend(mail.secret, { to, subject: opts.subject || "(no subject)", body: opts.body });
      return { ok: true, accountEmail: mail.secret.email || mail.row.label, id: sent };
    }
    return { ok: false, error: "Connect Google or Email in Settings before sending." };
  }
  const raw = encodeRfc2822({
    to,
    subject: opts.subject || "(no subject)",
    body: opts.body,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  });
  const threadId = parseGmailThreadId(opts.gmailThreadId, opts.threadRef);
  const payload: Record<string, string> = { raw };
  if (threadId) payload.threadId = threadId;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as {
    id?: string;
    threadId?: string;
    error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] };
  } | null;
  if (!res.ok) {
    const msg = data?.error?.message || "";
    const insufficient =
      res.status === 403 ||
      /insufficient|permission|scope/i.test(msg) ||
      Boolean(data?.error?.details?.some((d) => d.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT"));
    if (insufficient) {
      return {
        ok: false,
        needsReconnect: true,
        error: "Gmail send permission isn't granted on this token yet. Reconnect Google once in Settings → Connect apps, then click Send again.",
      };
    }
    return { ok: false, error: msg || `Gmail rejected the send (${res.status}).` };
  }
  return { ok: true, id: data?.id, threadId: data?.threadId || threadId, accountEmail: account.email };
}

export async function saveGmailDraft(
  scope: string,
  opts: {
    to: string;
    subject: string;
    body: string;
    accountEmail?: string;
    threadRef?: string;
    gmailThreadId?: string;
    inReplyTo?: string;
    references?: string;
  },
): Promise<{ ok: boolean; draftId?: string; accountEmail?: string; error?: string; needsReconnect?: boolean }> {
  const accounts = await refreshAccess(scope, "google");
  const account = pickGoogleAccount(accounts, opts.accountEmail, opts.threadRef);
  if (!account) {
    return { ok: false, error: "Connect Google in Settings before saving a Gmail draft." };
  }
  const raw = encodeRfc2822({
    to: opts.to || "",
    subject: opts.subject || "(no subject)",
    body: opts.body || "",
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  });
  const threadId = parseGmailThreadId(opts.gmailThreadId, opts.threadRef);
  const message: Record<string, string> = { raw };
  if (threadId) message.threadId = threadId;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as {
    id?: string;
    error?: { code?: number; message?: string; details?: { reason?: string }[] };
  } | null;
  if (!res.ok) {
    const msg = data?.error?.message || "";
    const insufficient =
      res.status === 403 ||
      /insufficient|permission|scope/i.test(msg) ||
      Boolean(data?.error?.details?.some((d) => d.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT"));
    if (insufficient) {
      return {
        ok: false,
        needsReconnect: true,
        error: "Gmail draft permission isn't granted on this token yet. Reconnect Google once in Settings → Connect apps, then try again.",
      };
    }
    return { ok: false, error: msg || `Gmail rejected saving the draft (${res.status}).` };
  }
  return { ok: true, draftId: data?.id, accountEmail: account.email };
}

export function connectedKinds(rows: ConnectorPublic[]) {
  return new Set(rows.map((row) => row.kind));
}
