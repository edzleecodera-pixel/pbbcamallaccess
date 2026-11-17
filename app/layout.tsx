import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PBB Collab 3.0 | CCTV Live Surveillance",
  description:
    "Full-screen dynamic resizable 3-camera CCTV monitor for Pinoy Big Brother Collab 3.0.",
  keywords: [
    "Pinoy Big Brother",
    "PBB CCTV",
    "PBB Live",
    "PBB Collab",
    "Bahay ni Kuya",
    "Shaka Player",
  ],
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full w-full antialiased dark">
      <body className="h-full w-full bg-black text-zinc-100 overflow-hidden select-none selection:bg-zinc-800 selection:text-white font-mono">
        {children}
      </body>
    </html>
  );
}
