"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

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
  // The drawings module is a normal lightweight view now (package builder,
  // no full-screen canvas), so the assistant stays available everywhere.
  return <AgentChatPanel />;
}
