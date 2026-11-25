import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  // sharp picks its native binary at runtime, so the file tracer does not follow it.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
  images: { unoptimized: true },
  async redirects() {
    return [
      { source: "/ask", destination: "/chat", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
