import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planovera Studio",
  description:
    "Web-based engineering drawing workspace with admin-managed SVG libraries, technical drafting tools, saved projects, and PDF export.",
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
      <body className="h-full">{children}</body>
    </html>
  );
}
