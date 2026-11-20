import { NextResponse } from "next/server";
import { callbackUrl, oauthConfigured, signState } from "@/lib/connectors";
import { vaultConfigured } from "@/lib/vault-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = ["google", "microsoft", "slack", "notion"] as const;
type OauthKind = (typeof KINDS)[number];

function isKind(value: string): value is OauthKind {
  return (KINDS as readonly string[]).includes(value);
}

export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const origin = new URL(req.url).origin;
  if (!isKind(kind)) return NextResponse.json({ error: "Unknown connector." }, { status: 404 });
  const back = callbackUrl(kind, origin);
  if (!oauthConfigured(kind)) {
    return NextResponse.json({
      configured: false,
      provider: kind,
      callbackUrl: back,
      message: `Needs ${kind === "google" ? "Google" : kind === "microsoft" ? "Microsoft" : kind === "slack" ? "Slack" : "Notion"} OAuth credentials in Vercel.`,
    });
  }
  if (!vaultConfigured()) {
    return NextResponse.json({ configured: false, provider: kind, callbackUrl: back, message: "Encrypted storage is not configured on this system." });
  }
  const scope = new URL(req.url).searchParams.get("scope") || "staff";
  const state = signState({ scope, kind });
  const redirect = authorizeUrl(kind, back, state);
  const res = NextResponse.redirect(redirect);
  res.cookies.set("hatch_oauth", state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), path: "/", maxAge: 600 });
  return res;
}

function authorizeUrl(kind: OauthKind, redirect: string, state: string) {
  if (kind === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.HATCH_GOOGLE_CLIENT_ID || "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    url.searchParams.set(
      "scope",
      "openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly",
    );
    return url;
  }
  if (kind === "microsoft") {
    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.set("client_id", process.env.HATCH_MICROSOFT_CLIENT_ID || "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "offline_access User.Read Mail.Read Mail.Send Calendars.ReadWrite Files.Read");
    return url;
  }
  if (kind === "slack") {
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", process.env.HATCH_SLACK_CLIENT_ID || "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "channels:read,channels:history,chat:write,groups:read");
    return url;
  }
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("client_id", process.env.HATCH_NOTION_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", state);
  return url;
}
