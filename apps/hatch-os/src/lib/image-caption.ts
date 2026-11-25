import { imageAssetPassage } from "./files.ts";
import { loadVisionJpeg } from "./image-cache.ts";
import { jpegDataUrl } from "./image-bytes.ts";
import { imageParts } from "./images.ts";
import { assertFirmModelHost, llmConfig, RUNPOD_MODEL } from "./llm.ts";
import { readRunpodJob, runpodEndpointId, submitRunpodChat } from "./runpod-jobs.ts";
import { readFileRecord, replaceFilePassage } from "./store.ts";
import { thinkingOffExtras } from "./think.ts";

const CAPTION_SYSTEM = [
  "You write a library caption for one image stored on Hatch.",
  "Describe what is visible and transcribe any text in the picture.",
  "Do not guess a person's name or identity. Do not invent facts that are not visible.",
  "Be factual and concise. Plain prose only.",
].join(" ");

function needsCaption(fileId: string): boolean {
  const rec = readFileRecord(fileId);
  if (!rec) return false;
  const text = rec.text.trim();
  if (!text || text === imageAssetPassage(rec.file.name)) return true;
  return /ocr is stubbed|can't read images|only see the filename/i.test(text);
}

async function captionOnce(fileId: string): Promise<void> {
  if (!needsCaption(fileId)) return;
  const jpeg = await loadVisionJpeg(fileId);
  const rec = readFileRecord(fileId);
  if (!jpeg?.length || !rec) return;
  const endpoint = llmConfig().primary;
  assertFirmModelHost(endpoint.rawBase);
  if (!endpoint.apiKey && endpoint.kind !== "ollama") return;
  const messages = [
    { role: "system", content: CAPTION_SYSTEM },
    {
      role: "user",
      content: imageParts("Describe this image for the firm library. Transcribe any visible text.", [jpegDataUrl(jpeg)]),
    },
  ];
  const text = await completeOnAsk(messages);
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 8) return;
  replaceFilePassage(fileId, imageAssetPassage(rec.file.name, clean.slice(0, 4000)));
}

async function completeOnAsk(
  messages: { role: string; content: string | ReturnType<typeof imageParts> }[],
): Promise<string> {
  const endpoint = llmConfig().primary;
  assertFirmModelHost(endpoint.rawBase);
  const endpointId = runpodEndpointId(endpoint.rawBase);
  if (endpointId && endpoint.apiKey) {
    const jobId = await submitRunpodChat(endpoint, {
      model: endpoint.model || RUNPOD_MODEL,
      messages,
      temperature: 0.2,
      extras: { ...thinkingOffExtras(true), max_tokens: 400 },
    });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const job = await readRunpodJob(endpoint, jobId);
      if (job.failed) return "";
      if (job.done) return job.text || "";
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    return "";
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`;
  const res = await fetch(`${endpoint.openaiRoot}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: endpoint.model,
      messages,
      temperature: 0.2,
      stream: false,
      max_tokens: 400,
      ...thinkingOffExtras(endpoint.kind === "remote"),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return "";
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  return json?.choices?.[0]?.message?.content || "";
}

/** Best-effort library text, after the user already has their reply. Skipped in unit tests. */
export function scheduleImageCaption(fileIds: string[]) {
  const ids = [...new Set(fileIds.filter(Boolean))];
  if (!ids.length) return;
  if (process.env.NODE_TEST_CONTEXT || process.env.HATCH_CAPTION_IMAGES === "0") return;
  const task = () => Promise.all(ids.map((id) => captionOnce(id).catch(() => undefined))).then(() => undefined);
  void import("next/server")
    .then((mod) => {
      try {
        mod.after(task);
      } catch {
        void task();
      }
    })
    .catch(() => {
      void task();
    });
}
