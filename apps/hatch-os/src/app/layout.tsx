import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import { AuthGate } from "@/components/AuthGate";
import { BetaChrome } from "@/components/os/BetaChrome";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";
import "./os.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hatch",
  description: "Hatch OS — the firm’s private assistant. Agents, file room, vault, and an audit log on your network.",
  applicationName: "Hatch",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Hatch",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B3B32",
  colorScheme: "light",
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("hatch-theme")||"light";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${fraunces.variable}`}>
        <a className="skip" href="#stage">
          Skip to content
        </a>
        <AppProvider>
          <ServiceWorker />
          <BetaChrome />
          <AuthGate>{children}</AuthGate>
        </AppProvider>
      </body>
    </html>
  );
}
