import { NextResponse } from "next/server";
import { demoModeEnabled } from "@/lib/demo";
import { FINANCE, HQ_OPS, LEGAL, NORTH_DESK, SOUTH_DESK } from "@/lib/departments";
import { clearSessionCookie, setSessionCookie, signSessionToken } from "@/lib/session-auth";
import { appReviewCode, testerByCode } from "@/lib/testers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    invite?: string;
    totp?: string;
    device?: string;
    method?: "totp" | "passkey";
  } | null;

  const invite = (body?.invite || "").trim().toUpperCase();
  const method = body?.method === "passkey" ? "passkey" : "totp";
  const device = (body?.device || "").trim() || "This device";

  if (!invite) {
    return NextResponse.json({ error: "Enter your invite code." }, { status: 400 });
  }

  if (invite.includes("NOSEAT")) {
    return NextResponse.json({ error: "No seat for this invite — admin can add one." }, { status: 403 });
  }

  const tester = testerByCode(invite);
  const adminCode = (process.env.HATCH_ADMIN_CODE || "").trim().toUpperCase();
  const isAdmin = Boolean(adminCode) && invite === adminCode;
  const isDemoStaff = demoModeEnabled() && invite === "STAFF-PREVIEW";
  const reviewCode = appReviewCode();
  const isAppReview = Boolean(reviewCode) && invite === reviewCode;

  if (!tester && !isAdmin && !isDemoStaff && !isAppReview) {
    return NextResponse.json(
      { error: "This code is not recognized. Ask your admin for a valid code." },
      { status: 401 },
    );
  }

  const departments = [NORTH_DESK, SOUTH_DESK, HQ_OPS, LEGAL, FINANCE];
  const enterprise = true;
  const homeDepartment = HQ_OPS;
  const scope = isAppReview ? "APP-REVIEW" : tester?.code || (isAdmin ? "ADMIN" : "STAFF-PREVIEW");
  const label = isAppReview ? "App Review" : tester?.label || (isAdmin ? "Admin" : "Staff preview");
  const role = "Partner" as const;

  const token = signSessionToken({
    scope,
    role,
    label,
    departments,
    enterprise,
    homeDepartment,
    appReview: isAppReview,
  });

  const res = NextResponse.json(
    {
      ok: true,
      token,
      method,
      deviceName: device,
      role,
      departments,
      rooms: departments,
      enterprise,
      homeDepartment,
      note: "Signed in.",
      inviteCode: scope,
      testerLabel: label,
      appReview: isAppReview,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(res, token, req.url);
  return res;
}

export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearSessionCookie(res, req.url);
  return res;
}
