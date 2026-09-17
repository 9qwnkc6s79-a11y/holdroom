import { mimeFromFilename } from "@/lib/files";
import { readFileBytes } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rec = readFileBytes(decodeURIComponent(id));
  if (!rec) return new Response(JSON.stringify({ error: "Unknown file." }), { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const mime = mimeFromFilename(rec.file.name, rec.file.kind);
  const disposition = download ? "attachment" : "inline";
  const filename = rec.file.name.replace(/"/g, "");

  return new Response(new Uint8Array(rec.bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
