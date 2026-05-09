import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planovera — Project Controls and Drawings",
  description:
    "Construction and non-construction project management with BOQ, payment certificates, work planning, and an integrated technical drawing workspace.",
  icons: {
    icon: "/brand/planovera-favicon.png",
    shortcut: "/brand/planovera-favicon.png",
    apple: "/brand/planovera-favicon.png",
  },
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
