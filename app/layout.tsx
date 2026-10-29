import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Keenventory",
  description: "Inventory, intelligently managed.",
  referrer: "no-referrer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
