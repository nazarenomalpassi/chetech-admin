import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Chetech Admin",
  description: "Sistema administrativo para locales de tecnologia"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
