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
//
// IMPORTANT: the pathname gate lives in this outer component, BEFORE anything
// touches the app store. Subscribing to useAppStore forces the whole persisted
// workspace (potentially several MB of JSON) to hydrate — which the standalone
// drawing tabs (/drawings/studio, /drawings/library) and public pages must not
// pay for just to render nothing.
export default function GlobalAssistant() {
  const pathname = usePathname() || "";

  const onAccountPage =
    pathname === "/workspace" ||
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/organization") ||
    pathname.startsWith("/admin");

  if (!onAccountPage) return null;
  return <AccountAssistant />;
}

// Store subscription isolated here so only account pages ever hydrate it.
function AccountAssistant() {
  const activeModule = useAppStore((s) => s.activeModule);

  // Keep the embedded drawing canvas (drawings module inside /workspace)
  // uncluttered.
  if (activeModule === "drawings") return null;
  return <AgentChatPanel />;
}
