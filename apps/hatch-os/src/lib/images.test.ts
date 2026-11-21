import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isAcceptedFilename, kindFromFilename } from "./files.ts";
import {
  attachmentContext,
  attachmentImageUrls,
  fitWithin,
  forStorage,
  imageParts,
  isHeicName,
  isRasterImage,
  isVideoFile,
  jpegDownloadName,
  MAX_IMAGE_DATA_URL_CHARS,
  OCR_NOTICE,
  textOnlyContent,
  turnContext,
  withImageParts,
} from "./images.ts";
import { visionLlmConfig } from "./llm.ts";

const SNAP = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAP)) delete process.env[key];
  }
  Object.assign(process.env, SNAP);
});

describe("image files", () => {
  it("accepts HEIC and HEIF names the file room used to reject", () => {
    assert.equal(isAcceptedFilename("IMG_2201.HEIC"), true);
    assert.equal(isAcceptedFilename("scan.heif"), true);
    assert.equal(kindFromFilename("IMG_2201.HEIC"), "Image");
    assert.equal(isHeicName("IMG_2201.HEIC", ""), true);
    assert.equal(isRasterImage("IMG_2201.HEIC", ""), true);
    assert.equal(isRasterImage("clip.mov", "video/quicktime"), false);
    assert.equal(isVideoFile("clip.mov", ""), true);
    assert.equal(jpegDownloadName("IMG_2201.HEIC"), "IMG_2201.jpg");
    assert.equal(jpegDownloadName("image"), "image.jpg");
  });

  it("scales the long edge down and leaves a small photo alone", () => {
    assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200, scale: 0.4 });
    assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600, scale: 1 });
  });
});

describe("vision message parts", () => {
  const picture = "data:image/jpeg;base64,aaaa";

  it("attaches image parts to the last user turn only", () => {
    const messages = [
      { role: "system", content: "rules" },
      { role: "user", content: "earlier" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "What is in this photo?" },
    ];
    const next = withImageParts(messages, [picture]);
    assert.equal(next[1].content, "earlier");
    assert.deepEqual(next[3].content, imageParts("What is in this photo?", [picture]));
    assert.equal(messages[3].content, "What is in this photo?");
  });

  it("sends a picture only when the attachment is marked for the vision model", () => {
    const huge = `data:image/jpeg;base64,${"a".repeat(MAX_IMAGE_DATA_URL_CHARS)}`;
    const urls = attachmentImageUrls([
      { reading: "ocr", image: picture },
      { reading: "vision", image: "https://example.com/a.jpg" },
      { reading: "vision", image: huge },
      { reading: "vision", image: picture },
    ]);
    assert.deepEqual(urls, [picture]);
  });

  it("drops the vision payload before the message is stored", () => {
    const stored = forStorage({
      fileId: "up-1",
      name: "desk.jpg",
      kind: "Image",
      preview: "data:image/jpeg;base64,thumb",
      image: picture,
      reading: "vision",
      note: "",
    });
    assert.equal(stored.image, undefined);
    assert.equal(stored.preview, "data:image/jpeg;base64,thumb");
    assert.equal(textOnlyContent(imageParts("hello", [picture])), "hello");
  });

  it("tells the text model the words came from OCR", () => {
    const block = attachmentContext({ name: "desk.jpg", reading: "ocr", text: "Invoice 441" });
    assert.match(block, /OCR text from the image/);
    assert.match(block, /cannot see the picture/);
    assert.match(block, /Invoice 441/);
    assert.match(OCR_NOTICE, /cannot see the picture itself/);
    const context = turnContext("", [{ name: "desk.jpg", reading: "ocr", text: "Invoice 441" }]);
    assert.match(context, /^Look at the attached image/);
    const vision = attachmentContext({ name: "desk.jpg", reading: "vision" });
    assert.match(vision, /included for the vision model/);
    assert.doesNotMatch(vision, /OCR text/);
  });
});

describe("visionLlmConfig", () => {
  it("stays off when only the text model is configured", () => {
    process.env.HATCH_LLM_BASE_URL = "https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1";
    process.env.HATCH_LLM_MODEL = "Qwen/Qwen3.8-27B-FP8";
    process.env.HATCH_LLM_API_KEY = "ask-key";
    delete process.env.HATCH_VISION_MODEL;
    delete process.env.HATCH_VISION_BASE_URL;
    delete process.env.HATCH_VISION_API_KEY;
    const cfg = visionLlmConfig();
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.endpoint, null);
  });

  it("uses a separate base URL and model when both are set", () => {
    process.env.HATCH_LLM_BASE_URL = "https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1";
    process.env.HATCH_LLM_API_KEY = "ask-key";
    process.env.HATCH_VISION_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";
    process.env.HATCH_VISION_BASE_URL = "https://api.runpod.ai/v2/visionendpoint/openai/v1";
    process.env.HATCH_VISION_API_KEY = "vision-key";
    const cfg = visionLlmConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.endpoint?.model, "Qwen/Qwen2.5-VL-7B-Instruct");
    assert.match(cfg.endpoint?.rawBase || "", /visionendpoint/);
    assert.equal(cfg.endpoint?.apiKey, "vision-key");
  });

  it("reuses the text endpoint when the vision base URL is unset", () => {
    process.env.HATCH_LLM_BASE_URL = "http://127.0.0.1:11434";
    process.env.HATCH_LLM_API_KEY = "";
    process.env.HATCH_VISION_MODEL = "gemma3";
    delete process.env.HATCH_VISION_BASE_URL;
    delete process.env.HATCH_VISION_API_KEY;
    const cfg = visionLlmConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.endpoint?.model, "gemma3");
    assert.match(cfg.endpoint?.rawBase || "", /127\.0\.0\.1:11434/);
  });

  it("stays off for an https endpoint with no key", () => {
    process.env.HATCH_LLM_BASE_URL = "https://llm.example/v1";
    delete process.env.HATCH_LLM_API_KEY;
    process.env.HATCH_VISION_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct";
    delete process.env.HATCH_VISION_BASE_URL;
    delete process.env.HATCH_VISION_API_KEY;
    assert.equal(visionLlmConfig().enabled, false);
  });
});
