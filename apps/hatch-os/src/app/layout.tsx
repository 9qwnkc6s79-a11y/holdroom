import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import { AuthGate } from "@/components/AuthGate";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Boundaries Coffee · Hatch OS",
  description: "Boundaries Coffee dry-run — departments, chat, files, library. Interim local Qwen on this machine.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Boundaries",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <a className="skip" href="#stage">
          Skip to content
        </a>
        <AppProvider>
          <ServiceWorker />
          <AuthGate>{children}</AuthGate>
        </AppProvider>
      </body>
    </html>
  );
}
