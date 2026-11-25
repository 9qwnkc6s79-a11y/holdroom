import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { imageAssetPassage } from "./files.ts";
import { jpegDataUrl, toVisionJpeg } from "./image-bytes.ts";
import {
  chooseChatLane,
  forStorage,
  imageParts,
  isRasterImage,
  isStoredFileId,
  MAX_EDGE,
  modelTextForTurn,
  scrubImageStub,
  withImageParts,
  withoutImagePayload,
} from "./images.ts";
import { assertFirmModelHost, isFrontierLlmHost, RUNPOD_ENDPOINT_ID, streamLlm } from "./llm.ts";
import { prepareTurnImages } from "./vision-turn.ts";

describe("picture files", () => {
  it("treats phone photos as pictures and leaves documents alone", () => {
    assert.equal(isRasterImage("IMG_2201.HEIC", ""), true);
    assert.equal(isRasterImage("photo.jpg", "image/jpeg"), true);
    assert.equal(isRasterImage("scan.pdf", "application/pdf"), false);
    assert.equal(isRasterImage("clip.mov", "video/quicktime"), false);
    assert.equal(isRasterImage("mark.svg", "image/svg+xml"), false);
    assert.equal(isStoredFileId("up-abc123"), true);
    assert.equal(isStoredFileId("chip-123"), false);
    assert.equal(isStoredFileId("file-123"), false);
  });

  it("indexes an image by name until a caption exists, without the old stub", () => {
    const bare = imageAssetPassage("desk.jpg");
    assert.equal(bare, "Image asset: desk.jpg");
    assert.doesNotMatch(bare, /stub|can't read|filename/i);
    assert.match(imageAssetPassage("desk.jpg", "A blue jacket and a name badge."), /blue jacket/);
  });
});

describe("vision message parts", () => {
  const picture = "data:image/jpeg;base64,aaaa";

  it("puts the picture on the latest user turn, ahead of the question", () => {
    const messages = [
      { role: "system", content: "rules" },
      { role: "user", content: "earlier" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "Produce a dossier on this guy" },
    ];
    const next = withImageParts(messages, [picture]);
    assert.equal(next[1].content, "earlier");
    assert.deepEqual(next[3].content, imageParts("Produce a dossier on this guy", [picture]));
    const parts = next[3].content;
    assert.ok(Array.isArray(parts));
    assert.equal(parts[0]?.type, "image_url");
    assert.equal(parts[1]?.type, "text");
    assert.equal(messages[3].content, "Produce a dossier on this guy");
  });

  it("drops picture bytes before the message is stored or polled", () => {
    const stored = forStorage({
      fileId: "up-1",
      name: "desk.jpg",
      kind: "Image",
      image: picture,
      note: "",
    });
    assert.equal(stored.image, undefined);
    const released = withoutImagePayload({
      pendingImages: [picture],
      llmMessages: [{ content: imageParts("hello", [picture]) }],
    });
    assert.equal(released.pendingImages, undefined);
    assert.equal(released.llmMessages?.[0]?.content, "hello");
  });

  it("removes the old filename-only note and keeps the question", () => {
    const context = [
      "Produce a dossier on this guy",
      "Attached file photo.jpg",
      "This test build can't read images. The model will only see the filename.",
      "No text could be read from this file.",
    ].join("\n");
    const clean = modelTextForTurn("Produce a dossier on this guy", context, true);
    assert.match(clean, /Produce a dossier on this guy/);
    assert.match(clean, /Attached file photo.jpg/);
    assert.doesNotMatch(clean, /can't read images|only see the filename|No text could be read/i);
    assert.equal(scrubImageStub("No text could be read from this PDF. The model will only see the filename."), "No text could be read from this PDF.");
    const pdf = modelTextForTurn("Summarize", "Attached file brief.pdf\nPage one", false);
    assert.match(pdf, /Page one/);
  });

  it("sends a picture to Ask even when the text lane would be Hermes", () => {
    assert.equal(chooseChatLane({ hasImage: true, agent: true, toolTurn: true }), "ask");
    assert.equal(chooseChatLane({ hasImage: false, agent: true, toolTurn: true }), "agent");
    assert.equal(chooseChatLane({ hasImage: false, agent: false, toolTurn: true }), "ask");
  });
});

describe("resize", () => {
  it("scales the long edge down and returns a jpeg the model can take", async () => {
    const png = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: { r: 12, g: 80, b: 160 } },
    })
      .png()
      .toBuffer();
    const jpeg = await toVisionJpeg(png);
    const meta = await sharp(jpeg).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, MAX_EDGE);
    assert.equal(meta.height, 640);
    const url = jpegDataUrl(jpeg);
    assert.match(url, /^data:image\/jpeg;base64,/);
    const prepared = await prepareTurnImages([{ fileId: "chip-1", name: "person.png", kind: "Image", image: `data:image/png;base64,${png.toString("base64")}` }]);
    assert.equal(prepared.hasImage, true);
    assert.equal(prepared.dataUrls.length, 1);
    assert.match(prepared.dataUrls[0] || "", /^data:image\/jpeg;base64,/);
    assert.deepEqual(prepared.fileIds, []);
  });
});

describe("firm model host", () => {
  it("refuses frontier hosts and allows the self-hosted Ask endpoint", () => {
    assert.equal(isFrontierLlmHost("https://api.openai.com/v1"), true);
    assert.equal(isFrontierLlmHost("https://api.anthropic.com/v1"), true);
    assert.equal(isFrontierLlmHost(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/openai/v1`), false);
    assert.equal(isFrontierLlmHost("http://127.0.0.1:11434"), false);
    assert.throws(() => assertFirmModelHost("https://api.openai.com/v1"), /outside AI lab/);
  });

  it("posts the picture to the Ask endpoint and not to a frontier host", async () => {
    const prev = {
      base: process.env.HATCH_LLM_BASE_URL,
      model: process.env.HATCH_LLM_MODEL,
      key: process.env.HATCH_LLM_API_KEY,
      provider: process.env.HATCH_LLM_PROVIDER,
      fallback: process.env.HATCH_LLM_ALLOW_OLLAMA_FALLBACK,
    };
    process.env.HATCH_LLM_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/openai/v1`;
    process.env.HATCH_LLM_MODEL = "Qwen/Qwen3.8-27B-FP8";
    process.env.HATCH_LLM_API_KEY = "ask-key";
    process.env.HATCH_LLM_PROVIDER = "openai-compatible";
    delete process.env.HATCH_LLM_ALLOW_OLLAMA_FALLBACK;
    const seen: { url: string; body: { messages?: { content?: unknown }[] } }[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, body: JSON.parse(String(init?.body || "{}")) });
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"A person in a blue jacket."}}]}\n\ndata: [DONE]\n\n',
            ),
          );
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;
    try {
      const result = await streamLlm(
        withImageParts([{ role: "user", content: "Produce a dossier on this guy" }], ["data:image/jpeg;base64,aaaa"]),
        () => undefined,
      );
      assert.match(result.text, /blue jacket/);
      assert.equal(seen.length, 1);
      assert.match(seen[0]?.url || "", new RegExp(RUNPOD_ENDPOINT_ID));
      assert.doesNotMatch(seen[0]?.url || "", /openai\.com|anthropic\.com/);
      const content = seen[0]?.body.messages?.[0]?.content;
      assert.ok(Array.isArray(content));
      assert.equal(content[0]?.type, "image_url");
    } finally {
      globalThis.fetch = orig;
      for (const [key, value] of Object.entries(prev)) {
        const env = key === "base"
          ? "HATCH_LLM_BASE_URL"
          : key === "model"
            ? "HATCH_LLM_MODEL"
            : key === "key"
              ? "HATCH_LLM_API_KEY"
              : key === "provider"
                ? "HATCH_LLM_PROVIDER"
                : "HATCH_LLM_ALLOW_OLLAMA_FALLBACK";
        if (value == null) delete process.env[env];
        else process.env[env] = value;
      }
    }
  });
});
