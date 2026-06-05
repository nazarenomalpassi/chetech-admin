import type { Metadata, Viewport } from "next";

import "@/app/globals.css";
import { PwaRegister } from "@/components/pwa/pwa-register";

export const metadata: Metadata = {
  title: {
    default: "Sistema CheTech",
    template: "%s | CheTech"
  },
  applicationName: "CheTech",
  description: "Sistema de gestion para CheTech",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "CheTech",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icons/icon-192.png"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d1d1b"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
