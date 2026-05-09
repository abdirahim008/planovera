import type * as FabricNS from "fabric";
type FabricMod = typeof FabricNS;

export type Point = { x: number; y: number };
export type Segment = { p1: Point; p2: Point };
export type SnapType = "endpoint" | "midpoint" | "edge";
export type SnapResult = { point: Point; type: SnapType; distance: number } | null;

export const SNAP_THRESHOLD = 10;

// Projected point onto a segment
function projectPointOnSegment(p: Point, s: Segment): Point {
  const l2 = Math.pow(s.p1.x - s.p2.x, 2) + Math.pow(s.p1.y - s.p2.y, 2);
  if (l2 === 0) return s.p1;
  let t = ((p.x - s.p1.x) * (s.p2.x - s.p1.x) + (p.y - s.p1.y) * (s.p2.y - s.p1.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: s.p1.x + t * (s.p2.x - s.p1.x), y: s.p1.y + t * (s.p2.y - s.p1.y) };
}

function getDist(p1: Point, p2: Point) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Extracts all absolute segments from an object
export function extractSegments(fabric: FabricMod, obj: any): Segment[] {
  // If it's a group, extract from children using absolute transforms natively
  // Actually, group's aCoords represent the bounding box of the entire group.
  // We can just use the bounding box of the group itself, OR iterate.
  // Iterating children inside a transformed group in Fabric requires manual matrix multiplication.
  // It's safer and cleaner to just use `aCoords` for groups and non-line shapes!
  
  if (obj.type === "line") {
    const line = obj as FabricNS.Line;
    const m = line.calcTransformMatrix();
    const pts = line.calcLinePoints();
    const p1 = fabric.util.transformPoint(new fabric.Point(pts.x1, pts.y1), m);
    const p2 = fabric.util.transformPoint(new fabric.Point(pts.x2, pts.y2), m);
    return [{ p1, p2 }];
  }

  // Fallback: use the 4 corners of the bounding box (aCoords)
  if (obj.aCoords) {
    const { tl, tr, br, bl } = obj.aCoords;
    return [
      { p1: tl, p2: tr },
      { p1: tr, p2: br },
      { p1: br, p2: bl },
      { p1: bl, p2: tl },
    ];
  }

  return [];
}

export function findSnapPoint(
  fabric: FabricMod,
  mousePt: Point,
  canvas: FabricNS.Canvas,
  excludeObjects: FabricNS.Object[] = []
): SnapResult {
  let bestDist = SNAP_THRESHOLD;
  let bestPt: Point | null = null;
  let bestType: SnapType = "edge"; // lower priority
  
  // Priority: endpoint (1) > midpoint (2) > edge (3)
  const priority = { endpoint: 3, midpoint: 2, edge: 1 };
  let currentPriority = 0;

  const allObjects = canvas.getObjects();
  const segments: Segment[] = [];

  allObjects.forEach((obj: any) => {
    // skip excluded, previews, markers
    if (excludeObjects.includes(obj)) return;
    if (obj.get("evented") === false && obj.get("selectable") === false) return;
    if ((obj as any).id === "snap_marker") return;

    segments.push(...extractSegments(fabric, obj));
  });

  for (const seg of segments) {
    // 1. Endpoints
    const d1 = getDist(mousePt, seg.p1);
    if (d1 < SNAP_THRESHOLD) {
      if (priority.endpoint > currentPriority || (priority.endpoint === currentPriority && d1 < bestDist)) {
        bestDist = d1; bestPt = seg.p1; bestType = "endpoint"; currentPriority = priority.endpoint;
      }
    }
    const d2 = getDist(mousePt, seg.p2);
    if (d2 < SNAP_THRESHOLD) {
      if (priority.endpoint > currentPriority || (priority.endpoint === currentPriority && d2 < bestDist)) {
        bestDist = d2; bestPt = seg.p2; bestType = "endpoint"; currentPriority = priority.endpoint;
      }
    }

    // 2. Midpoint
    const mid = { x: (seg.p1.x + seg.p2.x) / 2, y: (seg.p1.y + seg.p2.y) / 2 };
    const dm = getDist(mousePt, mid);
    if (dm < SNAP_THRESHOLD) {
      if (priority.midpoint > currentPriority || (priority.midpoint === currentPriority && dm < bestDist)) {
        bestDist = dm; bestPt = mid; bestType = "midpoint"; currentPriority = priority.midpoint;
      }
    }

    // 3. Edge
    const proj = projectPointOnSegment(mousePt, seg);
    const de = getDist(mousePt, proj);
    if (de < SNAP_THRESHOLD) {
       if (priority.edge > currentPriority || (priority.edge === currentPriority && de < bestDist)) {
        bestDist = de; bestPt = proj; bestType = "edge"; currentPriority = priority.edge;
      }
    }
  }

  if (bestPt) {
    return { point: bestPt, type: bestType, distance: bestDist };
  }
  return null;
}

export function renderSnapMarker(
  fabric: FabricMod,
  canvas: FabricNS.Canvas,
  snap: SnapResult
): FabricNS.Object | null {
  // Clear old marker dynamically without requestRenderAll to avoid jitter loop
  const old = canvas.getObjects().find((o: any) => o.id === "snap_marker");
  if (old) canvas.remove(old);

  if (!snap) return null;

  const color = snap.type === "endpoint" ? "#22c55e" : snap.type === "midpoint" ? "#3b82f6" : "#f59e0b";
  const size = 7;
  
  let marker: any;
  
  if (snap.type === "endpoint") {
    marker = new fabric.Rect({
      left: snap.point.x,
      top: snap.point.y,
      width: size,
      height: size,
      originX: "center",
      originY: "center",
      fill: "transparent",
      stroke: color,
      strokeWidth: 1.5,
    });
  } else if (snap.type === "midpoint") {
    marker = new fabric.Triangle({
      left: snap.point.x,
      top: snap.point.y,
      width: size + 2,
      height: size + 2,
      originX: "center",
      originY: "center",
      fill: "transparent",
      stroke: color,
      strokeWidth: 1.5,
    });
  } else {
    marker = new fabric.Circle({
      left: snap.point.x,
      top: snap.point.y,
      radius: size / 1.5,
      originX: "center",
      originY: "center",
      fill: "transparent",
      stroke: color,
      strokeWidth: 1.5,
    });
  }

  marker.set({
    selectable: false,
    evented: false,
    id: "snap_marker"
  });

  canvas.add(marker);
  return marker;
}
