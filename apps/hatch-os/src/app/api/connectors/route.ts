import { NextResponse } from "next/server";
import {
  CONNECTOR_CATALOG,
  MAIL_PRESETS,
  callbackUrl,
  connectEmail,
  connectGithubToken,
  connectLinearKey,
  connectMcp,
  connectNotionToken,
  connectSlackToken,
  disconnectConnector,
  listConnectors,
  oauthConfigured,
  testConnector,
  type ConnectorKind,
} from "@/lib/connectors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function scopeOf(req: Request, body?: { scope?: string }) {
  return body?.scope || req.headers.get("x-hatch-tester") || "staff";
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const connected = await listConnectors(scopeOf(req));
  const setup = (["google", "microsoft", "slack", "notion"] as const).map((kind) => ({
    kind,
    configured: oauthConfigured(kind),
    callbackUrl: callbackUrl(kind, origin),
  }));
  return NextResponse.json({ catalog: CONNECTOR_CATALOG, presets: MAIL_PRESETS, connected, setup });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!body?.kind) return NextResponse.json({ error: "Choose an app." }, { status: 400 });
  const scope = scopeOf(req, body);
  try {
    const kind = body.kind as ConnectorKind;
    if (kind === "email") {
      const preset = MAIL_PRESETS[body.preset] || null;
      const account = {
        email: (body.email || "").trim(),
        password: body.password || "",
        imapHost: (body.imapHost || preset?.imapHost || "").trim(),
        imapPort: Number(body.imapPort || preset?.imapPort || 993),
        smtpHost: (body.smtpHost || preset?.smtpHost || "").trim(),
        smtpPort: Number(body.smtpPort || preset?.smtpPort || 587),
      };
      if (!account.email || !account.password || !account.imapHost || !account.smtpHost) {
        return NextResponse.json({ error: "Email address, password, IMAP host, and SMTP host are required." }, { status: 400 });
      }
      const connector = await connectEmail(scope, account);
      return NextResponse.json({ connector });
    }
    if (kind === "slack") {
      if (!body.token) return NextResponse.json({ error: "Paste a Slack bot or user token." }, { status: 400 });
      return NextResponse.json({ connector: await connectSlackToken(scope, body.token.trim()) });
    }
    if (kind === "notion") {
      if (!body.token) return NextResponse.json({ error: "Paste a Notion integration token." }, { status: 400 });
      return NextResponse.json({ connector: await connectNotionToken(scope, body.token.trim()) });
    }
    if (kind === "github") {
      if (!body.token) return NextResponse.json({ error: "Paste a GitHub personal access token." }, { status: 400 });
      return NextResponse.json({ connector: await connectGithubToken(scope, body.token.trim()) });
    }
    if (kind === "linear") {
      if (!body.token) return NextResponse.json({ error: "Paste a Linear API key." }, { status: 400 });
      return NextResponse.json({ connector: await connectLinearKey(scope, body.token.trim()) });
    }
    if (kind === "mcp") {
      if (!body.url) return NextResponse.json({ error: "A remote MCP URL is required." }, { status: 400 });
      return NextResponse.json({ connector: await connectMcp(scope, body.url.trim(), body.token?.trim()) });
    }
    return NextResponse.json({ error: "Use the OAuth button for that app." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not connect.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "";
  if (!kind) return NextResponse.json({ error: "Name the app to disconnect." }, { status: 400 });
  await disconnectConnector(scopeOf(req), kind);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { kind?: ConnectorKind; scope?: string } | null;
  if (!body?.kind) return NextResponse.json({ error: "Name the app to test." }, { status: 400 });
  try {
    const detail = await testConnector(scopeOf(req, body), body.kind);
    return NextResponse.json({ ok: true, detail });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Test failed." }, { status: 400 });
  }
}
