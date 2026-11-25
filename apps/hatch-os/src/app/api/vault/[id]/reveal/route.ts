import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { recordAuditEntry } from "@/lib/store";
import { revealVaultItem, scrubVaultSecrets } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { actor?: string } | null;
  try {
    const revealed = revealVaultItem(id);
    if (!revealed) return NextResponse.json({ error: "Unknown vault item." }, { status: 404 });
    recordAuditEntry(
      {
        name: "vault_reveal",
        ok: true,
        detail: scrubVaultSecrets(`Owner revealed “${revealed.item.name}” (${revealed.item.kind}). Secret not recorded.`),
      },
      { actor: body?.actor || "owner", kind: "vault" },
    );
    return NextResponse.json(
      { item: revealed.item, secret: revealed.secret },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reveal this item.";
    return NextResponse.json({ error: scrubVaultSecrets(message) }, { status: 400 });
  }
}
