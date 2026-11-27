import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { IOS_OAUTH_RETURN, callbackUrl, readState, saveOAuthAccount } from "@/lib/connectors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function page(title: string, body: string, status = 200) {
  return new NextResponse(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Inter,sans-serif;background:#09090b;color:#fafafa;padding:32px"><h1>${title}</h1><p>${body}</p><p><a href="/chat" style="color:#fafafa">Back to Hatch</a></p></body>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function iosReturn(kind: string, ok: boolean) {
  const target = new URL(IOS_OAUTH_RETURN);
  target.searchParams.set("kind", kind);
  target.searchParams.set("ok", ok ? "1" : "0");
  return NextResponse.redirect(target.toString());
}

export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const jar = await cookies();
  const cookie = jar.get("hatch_oauth")?.value || "";
  const parsed = state ? readState(state) : null;
  const ios = parsed?.client === "ios";
  const cookieOk = Boolean(state) && state === cookie;
  if (!code || !parsed || parsed.kind !== kind || (!cookieOk && !ios)) {
    if (ios) return iosReturn(kind, false);
    return page("Could not connect", "The sign-in state did not match. Start again from Connect apps.", 400);
  }
  try {
    const saved = await exchange(kind, code, callbackUrl(kind as "google", url.origin));
    await saveOAuthAccount(parsed.scope, kind as "google", saved.label, saved.secret);
    if (ios) return iosReturn(kind, true);
    const res = page("Connected", `${saved.label} is connected. You can return to Hatch.`);
    res.cookies.set("hatch_oauth", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    if (ios) return iosReturn(kind, false);
    return page("Could not connect", err instanceof Error ? err.message : "The provider rejected the sign-in.", 400);
  }
}

async function exchange(kind: string, code: string, redirect: string) {
  if (kind === "google") {
    const body = new URLSearchParams({
      code,
      client_id: process.env.HATCH_GOOGLE_CLIENT_ID || "",
      client_secret: process.env.HATCH_GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirect,
      grant_type: "authorization_code",
    });
    const token = await postForm("https://oauth2.googleapis.com/token", body);
    const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token || ""}` },
    });
    const me = (await profile.json().catch(() => null)) as { email?: string } | null;
    const email = me?.email || "Google";
    return {
      label: email,
      secret: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
        email,
        scope: token.scope || "",
      },
    };
  }
  if (kind === "microsoft") {
    const body = new URLSearchParams({
      code,
      client_id: process.env.HATCH_MICROSOFT_CLIENT_ID || "",
      client_secret: process.env.HATCH_MICROSOFT_CLIENT_SECRET || "",
      redirect_uri: redirect,
      grant_type: "authorization_code",
    });
    const token = await postForm("https://login.microsoftonline.com/common/oauth2/v2.0/token", body);
    const profile = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${token.access_token || ""}` },
    });
    const me = (await profile.json().catch(() => null)) as { mail?: string; userPrincipalName?: string } | null;
    const email = me?.mail || me?.userPrincipalName || "Microsoft 365";
    return {
      label: email,
      secret: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
        email,
      },
    };
  }
  if (kind === "slack") {
    const body = new URLSearchParams({
      code,
      client_id: process.env.HATCH_SLACK_CLIENT_ID || "",
      client_secret: process.env.HATCH_SLACK_CLIENT_SECRET || "",
      redirect_uri: redirect,
    });
    const token = await postForm("https://slack.com/api/oauth.v2.access", body);
    const access = String(token.access_token || "");
    if (!access) throw new Error("Slack did not return a token.");
    return { label: String(token.team && (token.team as { name?: string }).name) || "Slack", secret: { token: access } };
  }
  const basic = Buffer.from(`${process.env.HATCH_NOTION_CLIENT_ID}:${process.env.HATCH_NOTION_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirect }),
  });
  const token = (await res.json()) as { access_token?: string; workspace_name?: string };
  if (!res.ok || !token.access_token) throw new Error("Notion did not return a token.");
  return { label: token.workspace_name || "Notion", secret: { token: token.access_token } };
}

async function postForm(url: string, body: URLSearchParams) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) throw new Error("The provider rejected the code exchange.");
  return json as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; team?: { name?: string } };
}
