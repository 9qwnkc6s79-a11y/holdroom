import { NextResponse } from "next/server";
import { recordAuditEntry } from "@/lib/store";
import { deleteVaultItem, scrubVaultSecrets } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { actor?: string; name?: string } | null;
  const removed = deleteVaultItem(id);
  if (!removed) return NextResponse.json({ error: "Unknown vault item." }, { status: 404 });
  recordAuditEntry(
    {
      name: "vault_delete",
      ok: true,
      detail: scrubVaultSecrets(`Owner removed vault item “${body?.name || id}”. Secret not recorded.`),
    },
    { actor: body?.actor || "owner", kind: "vault" },
  );
  return NextResponse.json({ ok: true });
}
