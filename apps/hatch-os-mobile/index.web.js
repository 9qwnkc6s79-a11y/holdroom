import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

function start() {
  require("expo-router/entry");
}

// Skia's web API captures CanvasKit at import time, so this has to finish
// before the app loads. Native builds use index.js and skip this file.
fetch("/canvaskit.wasm", { method: "HEAD" })
  .then((probe) => {
    const mime = probe.headers.get("content-type") || "";
    if (!probe.ok || !mime.includes("wasm")) {
      start();
      return;
    }
    return LoadSkiaWeb({ locateFile: () => "/canvaskit.wasm" }).then(start, start);
  })
  .catch(start);
