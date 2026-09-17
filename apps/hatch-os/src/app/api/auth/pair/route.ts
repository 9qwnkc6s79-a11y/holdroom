import { NextResponse } from "next/server";
import { MATTER_ALPHA, MATTER_BETA, VALID_INVITES } from "@/lib/mock-data";

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

  if (method === "totp" && !/^\d{6}$/.test(totp)) {
    return NextResponse.json(
      { error: "Enter the six-digit authenticator code from the box." },
      { status: 400 },
    );
  }

  const associate = VALID_INVITES.associate.includes(invite);
  const known =
    VALID_INVITES.partner.includes(invite) ||
    associate ||
    /^HATCH-[A-Z0-9]{3,}$/.test(invite);

  if (!known) {
    return NextResponse.json(
      { error: "This invite is not recognized on this box. Ask your admin." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    method,
    deviceName: device,
    role: associate ? "Associate" : "Partner",
    rooms: associate ? [MATTER_ALPHA] : [MATTER_ALPHA, MATTER_BETA],
    note: "Session lives on this box. The device stores a pointer, not the corpus.",
  });
}
