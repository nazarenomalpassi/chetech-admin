import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "@/app/globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: "Chetech Admin",
  description: "Sistema administrativo para locales de tecnología"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
