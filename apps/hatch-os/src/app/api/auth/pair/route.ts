import { NextResponse } from "next/server";
import { VALID_INVITES } from "@/lib/mock-data";
import { FINANCE, HQ_OPS, LEGAL, NORTH_DESK, SOUTH_DESK } from "@/lib/departments";
import { testerByCode } from "@/lib/testers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    invite?: string;
    totp?: string;
    device?: string;
    method?: "totp" | "passkey";
  } | null;

  const invite = (body?.invite || "").trim().toUpperCase();
  const totp = (body?.totp || "").trim();
  const method = body?.method === "passkey" ? "passkey" : "totp";
  const device = (body?.device || "").trim() || "This browser";

  if (!invite) {
    return NextResponse.json({ error: "Ask your admin for an invite code." }, { status: 400 });
  }

  if (VALID_INVITES.noseat.includes(invite) || invite.includes("NOSEAT")) {
    return NextResponse.json(
      { error: "No seat for this invite — admin can add one." },
      { status: 403 },
    );
  }

  const tester = testerByCode(invite);
  // The six-digit box code is only for the staff preview. Tester codes are the whole sign-in.
  if (!tester && method === "totp" && !/^\d{6}$/.test(totp)) {
    return NextResponse.json(
      { error: "That code was not recognized. Use the code you were sent." },
      { status: 400 },
    );
  }

  const associate = VALID_INVITES.associate.includes(invite);
  const known =
    Boolean(tester) ||
    VALID_INVITES.partner.includes(invite) ||
    associate ||
    invite === "BOUNDARIES" ||
    invite === "COFFEE";

  if (!known) {
    return NextResponse.json(
      { error: "This invite is not recognized on this box. Ask your admin." },
      { status: 400 },
    );
  }

  const departments = associate ? [NORTH_DESK] : [NORTH_DESK, SOUTH_DESK, HQ_OPS, LEGAL, FINANCE];
  const enterprise = !associate;
  const homeDepartment = associate ? NORTH_DESK : HQ_OPS;

  return NextResponse.json({
    ok: true,
    method,
    deviceName: device,
    role: associate ? "Associate" : "Partner",
    departments,
    rooms: departments,
    enterprise,
    homeDepartment,
    note: "Session lives on this phone.",
    inviteCode: tester?.code || invite,
    testerLabel: tester?.label || "",
  });
}
