import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PlsPay", template: "%s · PlsPay" },
  description: "PayNow payment requests and bill splits for Singapore.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-SG">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
