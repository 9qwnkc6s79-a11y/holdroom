import { createHmac, randomBytes } from "node:crypto";
import { deleteRecord, readRecords, saveRecord } from "./beta-store.ts";
import { decryptJson, encryptJson, vaultConfigured, vaultKey } from "./vault-crypto.ts";
import { checkImap, checkSmtp, imapSearch, smtpSend, type MailAccount } from "./mail-probe.ts";
import { safeCode } from "./testers.ts";
import type { ToolEvent } from "./types.ts";

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

/** Read-only Google scopes, plus openid and email so the account can be labeled. */
export const GOOGLE_OAUTH_SCOPE =
  "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.readonly";

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

export async function refreshAccess(scope: string, kind: "google" | "microsoft"): Promise<{ id: string; accessToken: string; email?: string }[]> {
  const rows = await readRecords<StoredConnector>(folder(scope));
  const matches = rows.filter((row) => row.kind === kind);
  const ready: { id: string; accessToken: string; email?: string }[] = [];
  for (const row of matches) {
    let secret: GoogleSecret;
    try {
      secret = decryptJson<GoogleSecret>(row.secret);
    } catch {
      continue;
    }
    if (!secret.accessToken) continue;
    const fresh = await refreshOAuth(scope, row, secret, kind);
    if (fresh.accessToken) ready.push({ id: row.id, accessToken: fresh.accessToken, email: fresh.email || row.label });
  }
  return ready;
}

async function refreshOAuth(scope: string, row: StoredConnector, secret: GoogleSecret, kind: "google" | "microsoft"): Promise<GoogleSecret> {
  if (secret.expiresAt && secret.expiresAt > Date.now() + 60_000) return secret;
  if (!secret.refreshToken) return secret;
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
  const res = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const token = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number } | null;
  if (!res.ok || !token?.access_token) return secret;
  const next: GoogleSecret = {
    ...secret,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || secret.refreshToken,
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
  };
  await saveConnector(scope, kind, row.label, row.detail, next, row.id);
  return next;
}
type SlackSecret = { token: string };
type NotionSecret = { token: string };
type GithubSecret = { token: string };
type LinearSecret = { token: string };
type McpSecret = { url: string; token?: string; tools?: string[] };

async function gmailFetch(scope: string, path: string, init?: RequestInit) {
  const accounts = await refreshAccess(scope, "google");
  const token = accounts[0]?.accessToken;
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}`, ...(init?.headers || {}) };
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, { ...init, headers });
  return res;
}

async function graphGet(scope: string, path: string) {
  const accounts = await refreshAccess(scope, "microsoft");
  const token = accounts[0]?.accessToken;
  if (!token) return null;
  return fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

function tool(name: string, ok: boolean, detail: string): { event: ToolEvent; extra?: string } {
  return { event: { name, ok, detail: detail.slice(0, 500), input: detail.slice(0, 180) }, extra: ok ? detail.slice(0, 4000) : undefined };
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

async function runEmail(scope: string, name: string, args: Record<string, string>) {
  const mail = await readSecret<MailAccount>(scope, "email");
  const google = await readSecret<GoogleSecret>(scope, "google");
  if (name === "email_search" || name === "email_read") {
    if (google) {
      const q = encodeURIComponent(args.query || args.q || "");
      const res = await gmailFetch(scope, `/users/me/messages?maxResults=5&q=${q}`);
      const data = (await res?.json().catch(() => null)) as { messages?: { id: string }[] } | null;
      if (data?.messages?.length) {
        const bits: string[] = [];
        for (const message of data.messages.slice(0, 5)) {
          const full = await gmailFetch(scope, `/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`);
          const body = (await full?.json().catch(() => null)) as { snippet?: string; payload?: { headers?: { name: string; value: string }[] } } | null;
          const headers = body?.payload?.headers || [];
          const subject = headers.find((header) => header.name === "Subject")?.value || body?.snippet || message.id;
          bits.push(subject);
        }
        return tool(name, true, `Gmail: ${bits.join(" · ")}`);
      }
    }
    const outlook = await graphGet(scope, `/me/messages?$top=8&$select=subject,bodyPreview,from`);
    if (outlook) {
      const data = (await outlook.json().catch(() => null)) as { value?: { subject?: string; bodyPreview?: string }[] } | null;
      const q = (args.query || args.q || "").toLowerCase();
      const rows = (data?.value || []).filter((item) => !q || `${item.subject || ""} ${item.bodyPreview || ""}`.toLowerCase().includes(q));
      if (rows.length) return tool(name, true, `Outlook: ${rows.map((item) => item.subject || item.bodyPreview || "Message").join(" · ")}`);
    }
    if (!mail && !google) return tool(name, false, "Connect Email, Gmail, or Outlook first.");
    if (mail) return tool(name, true, await imapSearch(mail.secret, args.query || args.subject || ""));
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
  if (!args.to || !args.body && !args.text) return tool(name, false, "A recipient and a message are required.");
  if (mail) {
    const sent = await smtpSend(mail.secret, { to: args.to, subject: args.subject || "(no subject)", body: args.body || args.text || "" });
    return tool(name, true, sent);
  }
  if (google) return tool(name, false, "Gmail is connected read-only. Nothing was sent.");
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
  const q = (args.query || "").replace(/'/g, "");
  if (googleAccounts[0]) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?pageSize=5&q=${encodeURIComponent(`name contains '${q}'`)}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${googleAccounts[0].accessToken}` },
    });
    const data = (await res.json().catch(() => null)) as { files?: { id: string; name: string }[] } | null;
    const lines = (data?.files || []).map((file) => file.name).join("\n");
    if (lines) return tool(name, res.ok, lines);
  }
  const drive = await graphGet(scope, `/me/drive/root/children?$top=8&$select=name`);
  const data = (await drive?.json().catch(() => null)) as { value?: { name?: string }[] } | null;
  const names = (data?.value || []).map((file) => file.name || "").filter((fileName) => !q || fileName.toLowerCase().includes(q.toLowerCase()));
  if (!googleAccounts[0] && !drive) return tool(name, false, "Connect Google Drive or OneDrive first.");
  return tool(name, true, names.join("\n") || "No files matched.");
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

export function connectedKinds(rows: ConnectorPublic[]) {
  return new Set(rows.map((row) => row.kind));
}
