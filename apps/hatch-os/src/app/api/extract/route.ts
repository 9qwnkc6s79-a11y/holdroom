import { requireSession } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import { isRasterImage } from "@/lib/images";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEXT_EXT = /\.(txt|md|markdown|csv|json|js|jsx|ts|tsx|py|html|css|yml|yaml)$/i;

/** Pull readable text out of a chat attachment. Pictures are sent to the model as images, not as this text. */
export async function POST(req: Request) {
  const auth = requireSession(req);
  if (auth.error) return auth.error;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  }
  const name = file.name || "file";
  if (isRasterImage(name, file.type || "")) {
    return NextResponse.json({
      name,
      text: "",
      vision: true,
      note: "",
    });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    const raw = buf.toString("latin1");
    const strings = [...raw.matchAll(/\(([^)]{4,})\)/g)].map((match) => match[1]).join("\n");
    const text = strings.trim();
    return NextResponse.json({
      name,
      text: text.slice(0, 12000),
      note: text ? "" : "No text could be read from this PDF. The model will only see the filename.",
    });
  }
  if (file.type.startsWith("text/") || TEXT_EXT.test(name) || file.type === "application/json") {
    const text = buf.toString("utf8").replace(/\u0000/g, "").slice(0, 12000);
    return NextResponse.json({ name, text, note: "" });
  }
  return NextResponse.json({
    name,
    text: "",
    note: "This file type isn't extracted. The model will only see the filename.",
  });
}
