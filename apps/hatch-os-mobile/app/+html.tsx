import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "#09090B", height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Hatch OS</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: "html, body, #root { background: #09090B; height: 100%; margin: 0; } body { overflow: hidden; }",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
