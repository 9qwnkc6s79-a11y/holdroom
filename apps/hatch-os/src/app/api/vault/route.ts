import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { recordAuditEntry } from "@/lib/store";
import type { VaultKind } from "@/lib/types";
import { createVaultItem, listVaultPublic, scrubVaultSecrets, vaultKeyError } from "@/lib/vault";

export const dynamic = "force-dynamic";

const KINDS = new Set<VaultKind>(["login", "token", "card"]);

export async function GET(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const keyError = vaultKeyError();
  return NextResponse.json(
    { items: listVaultPublic(), configured: !keyError, error: keyError },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    kind?: VaultKind;
    name?: string;
    whenToUse?: string;
    username?: string;
    password?: string;
    token?: string;
    pan?: string;
    cvv?: string;
    exp?: string;
    holder?: string;
    actor?: string;
  } | null;
  const kind = body?.kind && KINDS.has(body.kind) ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "Choose login, token, or card." }, { status: 400 });
  try {
    const item = createVaultItem({
      kind,
      name: body?.name || "",
      whenToUse: body?.whenToUse || "",
      username: body?.username,
      secret: {
        password: body?.password,
        token: body?.token,
        pan: body?.pan,
        cvv: body?.cvv,
        exp: body?.exp,
        holder: body?.holder,
      },
    });
    recordAuditEntry(
      {
        name: "vault_save",
        ok: true,
        detail: scrubVaultSecrets(`Saved vault item “${item.name}” (${item.kind}). Secret not recorded.`),
      },
      { actor: body?.actor || "owner", kind: "vault" },
    );
    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the vault item.";
    return NextResponse.json({ error: scrubVaultSecrets(message) }, { status: 400 });
  }
}
