import { Suspense } from "react";

import DrawingStudioRoute from "@/components/drawings/DrawingStudioRoute";

export default function DrawingStudioPage() {
  return (
    <Suspense fallback={null}>
      <DrawingStudioRoute />
    </Suspense>
  );
}
