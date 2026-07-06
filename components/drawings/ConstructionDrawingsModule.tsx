"use client";

import DrawingPackagesModule from "@/components/drawings/DrawingPackagesModule";

// The drawings module is the lightweight package builder: pick curated
// warehouse drawings, fill the title block, export PDF. The full canvas
// studio still exists but only as an admin curation tool (linked from the
// package header for admins; the /drawings/studio route itself is gated).
export default function ConstructionDrawingsModule() {
  return <DrawingPackagesModule />;
}
