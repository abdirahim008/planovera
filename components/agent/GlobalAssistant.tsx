"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { useAppStore } from "@/lib/store";

// Lazy + client-only: the assistant is non-critical chrome, kept out of every
// page's initial bundle. It loads when first shown.
const AgentChatPanel = dynamic(() => import("@/components/agent/AgentChatPanel"), {
  ssr: false,
});

// Mounted once in the root layout so the assistant is reachable from every page
// inside the user's account — workspace, organization, and admin — not just one
// module. Hidden on public/auth pages and on the full-screen drawing canvas.
export default function GlobalAssistant() {
  const pathname = usePathname() || "";
  const activeModule = useAppStore((s) => s.activeModule);

  const onAccountPage =
    pathname === "/workspace" ||
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/organization") ||
    pathname.startsWith("/admin");

  // Keep the drawing canvas uncluttered (route + embedded module).
  const onDrawingCanvas = pathname.startsWith("/drawings") || activeModule === "drawings";

  if (!onAccountPage || onDrawingCanvas) return null;
  return <AgentChatPanel />;
}
