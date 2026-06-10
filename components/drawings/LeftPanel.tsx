"use client";

// Drawing studio left panel: library browser, parametric editors, tools, admin publishing.
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Layers3 } from "lucide-react";
import type { TitleBlockData } from "@/lib/drawings/fabricHelpers";
import { PATTERNS, PatternType } from "@/lib/drawings/patterns";
import {
  ADMIN_SVG_TEMPLATES,
  DETAIL_BLOCKS,
  LIBRARY_CATEGORIES,
  LibraryCategory,
  LibraryItem,
  SavedProject,
  UserSession,
  parseTags,
} from "@/lib/drawings/appModel";
import {
  BeamDetailParams,
  ColumnDetailParams,
  FootingDetailParams,
  OpeningType,
  ParametricBlockKind,
  ParametricBlockParams,
  ParametricBlockState,
  StoreyMode,
  StructuralView,
  TEMPLATE_REGISTRY,
  WallOpeningParams,
  getDefaultParametricParams,
  normalizeParametricParams,
  type TemplateParamValues,
} from "@/lib/drawings/parametricBlocks";

type LineStyle = "solid" | "dashed";
type TextStyleSnapshot = {
  hasText: boolean;
  fontSize: number | null;
  fill: string | null;
};
type TextStyleUpdate = {
  fontSize?: number;
  fill?: string;
};

interface LeftPanelProps {
  layout?: "top" | "side";
  activeTray?: DrawingPanelTab | null;
  onActiveTrayChange?: (tab: DrawingPanelTab | null) => void;
  session: UserSession;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  libraryItems: LibraryItem[];
  favoriteIds: string[];
  recentIds: string[];
  onToggleFavorite: (libraryId: string) => void;
  onRecordLibraryUse: (libraryId: string) => void;
  savedProjects: SavedProject[];
  activeProjectId: string | null;
  selectedCount: number;
  selectedTextStyle: TextStyleSnapshot;
  selectedParametricBlock: ParametricBlockState | null;
  statusMessage: string | null;
  titleBlockData: TitleBlockData;
  setTitleBlockData: (data: TitleBlockData) => void;
  onAddSvg: (svg: string) => void;
  onAddParametricBlock: (kind: ParametricBlockKind, params?: Partial<ParametricBlockParams>) => void;
  onUpdateParametricBlock: (params: Partial<ParametricBlockParams>) => void;
  onApplyTitleBlock: () => void;
  onRemoveTitleBlock: () => void;
  onApplyPattern: (id: PatternType, scale: number, color: string) => void;
  onUpdateStroke: (color: string, width: number, enabled: boolean) => void;
  onUpdateLineStyle: (style: LineStyle) => void;
  onUpdateTextStyle: (updates: TextStyleUpdate) => void;
  onSaveProject: () => void;
  onOpenProject: (project: SavedProject) => void;
  onDeleteProject: (projectId: string) => void;
  onPublishRawSvg: (payload: {
    name: string;
    category: LibraryCategory;
    description: string;
    tags: string[];
    svg: string;
  }) => void;
  onPublishCanvasToLibrary: (payload: {
    name: string;
    category: LibraryCategory;
    description: string;
    tags: string[];
  }) => void;
  onDeleteLibraryItem: (item: LibraryItem) => void;
}

export type DrawingPanelTab = "library" | "properties" | "details" | "projects" | "admin";

export default function LeftPanel({
  layout = "top",
  activeTray,
  onActiveTrayChange,
  session,
  projectName,
  onProjectNameChange,
  libraryItems,
  favoriteIds,
  recentIds,
  onToggleFavorite,
  onRecordLibraryUse,
  savedProjects,
  activeProjectId,
  selectedCount,
  selectedTextStyle,
  selectedParametricBlock,
  statusMessage,
  titleBlockData,
  setTitleBlockData,
  onAddSvg,
  onAddParametricBlock,
  onUpdateParametricBlock,
  onApplyTitleBlock,
  onRemoveTitleBlock,
  onApplyPattern,
  onUpdateStroke,
  onUpdateLineStyle,
  onUpdateTextStyle,
  onSaveProject,
  onOpenProject,
  onDeleteProject,
  onPublishRawSvg,
  onPublishCanvasToLibrary,
  onDeleteLibraryItem,
}: LeftPanelProps) {
  const isAdmin = session.role === "admin";
  const tabs: Array<{ id: DrawingPanelTab; label: string; short: string }> = [
    { id: "library", label: "Library", short: "Lib" },
    { id: "properties", label: "Properties", short: "Prop" },
    { id: "details", label: "Tools", short: "Tool" },
    { id: "projects", label: "Projects", short: "Proj" },
    ...(isAdmin ? [{ id: "admin" as const, label: "Publish", short: "Pub" }] : []),
  ];

  const [localActiveTray, setLocalActiveTray] = useState<DrawingPanelTab | null>(
    layout === "side" ? "properties" : null,
  );
  const activeTrayValue = activeTray !== undefined ? activeTray : localActiveTray;
  const setTray = (next: DrawingPanelTab | null) => {
    if (onActiveTrayChange) {
      onActiveTrayChange(next);
      return;
    }
    setLocalActiveTray(next);
  };
  const tab = activeTrayValue ?? "library";
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategory | "all">("all");
  const [hatchScale, setHatchScale] = useState(1);
  const [hatchColor, setHatchColor] = useState("#0f172a");
  const [strokeColor, setStrokeColor] = useState("#0f172a");
  const [strokeWidth, setStrokeWidth] = useState(1.2);
  const [hasStroke, setHasStroke] = useState(true);
  const [lineStyle, setLineStyle] = useState<LineStyle>("solid");
  const [fontSize, setFontSize] = useState(18);
  const [fontColor, setFontColor] = useState("#0f172a");
  const [parametricDraft, setParametricDraft] = useState<ParametricBlockParams | null>(null);
  const [svgText, setSvgText] = useState("");
  const [svgUploadName, setSvgUploadName] = useState("");
  const [svgUploadError, setSvgUploadError] = useState<string | null>(null);
  const svgFileInputRef = useRef<HTMLInputElement | null>(null);
  const [beamWidth, setBeamWidth] = useState(400);
  const [beamDepth, setBeamDepth] = useState(400);
  const [beamTopBars, setBeamTopBars] = useState(2);
  const [beamBottomBars, setBeamBottomBars] = useState(3);
  const [beamBarDia, setBeamBarDia] = useState(16);
  const [beamStirrupDia, setBeamStirrupDia] = useState(8);
  const [beamStirrupSpacing, setBeamStirrupSpacing] = useState(150);
  const [columnView, setColumnView] = useState<StructuralView>("plan");
  const [columnWidth, setColumnWidth] = useState(300);
  const [columnDepth, setColumnDepth] = useState(300);
  const [columnBars, setColumnBars] = useState(8);
  const [columnBarDia, setColumnBarDia] = useState(16);
  const [columnTieDia, setColumnTieDia] = useState(8);
  const [columnTieSpacing, setColumnTieSpacing] = useState(150);
  const [columnStoreyMode, setColumnStoreyMode] = useState<StoreyMode>("single");
  const [footingView, setFootingView] = useState<StructuralView>("plan");
  const [footingWidth, setFootingWidth] = useState(1800);
  const [footingLength, setFootingLength] = useState(1800);
  const [footingDepth, setFootingDepth] = useState(500);
  const [footingColumnWidth, setFootingColumnWidth] = useState(300);
  const [footingColumnDepth, setFootingColumnDepth] = useState(300);
  const [footingBarDia, setFootingBarDia] = useState(16);
  const [footingBarCountX, setFootingBarCountX] = useState(7);
  const [footingBarCountY, setFootingBarCountY] = useState(7);
  const [wallLength, setWallLength] = useState(3600);
  const [wallThickness, setWallThickness] = useState(200);
  const [openingType, setOpeningType] = useState<OpeningType>("door");
  const [openingWidth, setOpeningWidth] = useState(900);
  const [openingOffset, setOpeningOffset] = useState(1350);
  const [publishName, setPublishName] = useState("Library Drawing");
  const [publishCategory, setPublishCategory] = useState<LibraryCategory>("details");
  const [publishDescription, setPublishDescription] = useState(
    "Editable drawing block prepared by the admin studio.",
  );
  const [publishTags, setPublishTags] = useState("library, editable, drawing");

  const [assetFilter, setAssetFilter] = useState<"all" | "object" | "drawing">("all");

  const filteredItems = useMemo(() => {
    const needle = libraryQuery.trim().toLowerCase();
    return libraryItems.filter((item) => {
      const categoryMatch = libraryCategory === "all" || item.category === libraryCategory;
      if (!categoryMatch) return false;
      // Treat items with no assetType as "object" (legacy library entries).
      const effectiveType = item.assetType ?? "object";
      if (assetFilter !== "all" && effectiveType !== assetFilter) return false;
      if (!needle) return true;
      const haystack = [item.name, item.description, ...item.tags, item.author].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [assetFilter, libraryCategory, libraryItems, libraryQuery]);

  const favoriteItems = useMemo(
    () =>
      favoriteIds
        .map((id) => libraryItems.find((item) => item.id === id))
        .filter((item): item is LibraryItem => Boolean(item)),
    [favoriteIds, libraryItems],
  );

  const recentItems = useMemo(
    () =>
      recentIds
        .map((id) => libraryItems.find((item) => item.id === id))
        .filter((item): item is LibraryItem => Boolean(item))
        .filter((item) => !favoriteIds.includes(item.id))
        .slice(0, 6),
    [favoriteIds, libraryItems, recentIds],
  );

  const handleInsertLibraryItem = (item: LibraryItem) => {
    onRecordLibraryUse(item.id);
    if (item.parametricKind) {
      // Insert as an editable parametric block so dimensions can be changed.
      onAddParametricBlock(item.parametricKind, item.parametricParams as Partial<ParametricBlockParams>);
      return;
    }
    onAddSvg(item.svg);
  };

  const updateTitleBlock = <K extends keyof TitleBlockData>(
    key: K,
    value: TitleBlockData[K],
  ) => setTitleBlockData({ ...titleBlockData, [key]: value });

  const setNumber = (setter: (value: number) => void) => (value: string) => {
    setter(Number(value) || 0);
  };

  useEffect(() => {
    if (selectedTextStyle.fontSize) setFontSize(selectedTextStyle.fontSize);
    if (selectedTextStyle.fill) setFontColor(selectedTextStyle.fill);
  }, [selectedTextStyle.fill, selectedTextStyle.fontSize]);

  useEffect(() => {
    setParametricDraft(selectedParametricBlock?.params ?? null);
  }, [selectedParametricBlock]);

  const applyLineStyle = (style: LineStyle) => {
    setLineStyle(style);
    onUpdateLineStyle(style);
  };

  const applyFontSize = (next: number) => {
    const safeSize = Math.min(Math.max(next, 4), 96);
    setFontSize(safeSize);
    onUpdateTextStyle({ fontSize: safeSize });
  };

  const applyFontColor = (next: string) => {
    setFontColor(next);
    onUpdateTextStyle({ fill: next });
  };

  const updateBeamDraft = <K extends keyof BeamDetailParams>(key: K, value: BeamDetailParams[K]) => {
    if (!selectedParametricBlock || selectedParametricBlock.kind !== "beam-detail") return;
    setParametricDraft((current) => ({
      ...((current ?? selectedParametricBlock.params) as BeamDetailParams),
      [key]: value,
    }));
  };

  const updateWallDraft = <K extends keyof WallOpeningParams>(key: K, value: WallOpeningParams[K]) => {
    if (!selectedParametricBlock || selectedParametricBlock.kind === "beam-detail") return;
    setParametricDraft((current) => ({
      ...((current ?? selectedParametricBlock.params) as WallOpeningParams),
      [key]: value,
    }));
  };

  const updateColumnDraft = <K extends keyof ColumnDetailParams>(key: K, value: ColumnDetailParams[K]) => {
    if (!selectedParametricBlock || selectedParametricBlock.kind !== "column-detail") return;
    setParametricDraft((current) => ({
      ...((current ?? selectedParametricBlock.params) as ColumnDetailParams),
      [key]: value,
    }));
  };

  const updateFootingDraft = <K extends keyof FootingDetailParams>(key: K, value: FootingDetailParams[K]) => {
    if (!selectedParametricBlock || selectedParametricBlock.kind !== "footing-detail") return;
    setParametricDraft((current) => ({
      ...((current ?? selectedParametricBlock.params) as FootingDetailParams),
      [key]: value,
    }));
  };

  const applyParametricDraft = () => {
    if (!selectedParametricBlock || !parametricDraft) return;
    onUpdateParametricBlock(normalizeParametricParams(selectedParametricBlock.kind, parametricDraft));
  };

  const resetParametricDraft = () => {
    if (!selectedParametricBlock) return;
    const defaults = getDefaultParametricParams(selectedParametricBlock.kind);
    setParametricDraft(defaults);
    onUpdateParametricBlock(defaults);
  };

  const insertBeamDetail = () =>
    onAddParametricBlock("beam-detail", {
      widthMm: beamWidth,
      depthMm: beamDepth,
      topBars: beamTopBars,
      bottomBars: beamBottomBars,
      barDiaMm: beamBarDia,
      stirrupDiaMm: beamStirrupDia,
      stirrupSpacingMm: beamStirrupSpacing,
    });

  const insertColumnDetail = () =>
    onAddParametricBlock("column-detail", {
      view: columnView,
      widthMm: columnWidth,
      depthMm: columnDepth,
      mainBars: columnBars,
      barDiaMm: columnBarDia,
      tieDiaMm: columnTieDia,
      tieSpacingMm: columnTieSpacing,
      storeyMode: columnStoreyMode,
    });

  const insertFootingDetail = () =>
    onAddParametricBlock("footing-detail", {
      view: footingView,
      footingWidthMm: footingWidth,
      footingLengthMm: footingLength,
      footingDepthMm: footingDepth,
      columnWidthMm: footingColumnWidth,
      columnDepthMm: footingColumnDepth,
      barDiaMm: footingBarDia,
      barCountX: footingBarCountX,
      barCountY: footingBarCountY,
    });

  const insertWallOpening = () =>
    onAddParametricBlock("wall-opening", {
      wallLengthMm: wallLength,
      wallThicknessMm: wallThickness,
      openingType,
      openingWidthMm: openingWidth,
      openingOffsetMm: openingOffset,
    });

  const handleSvgFile = (file?: File | null) => {
    if (!file) return;

    setSvgUploadError(null);
    const name = file.name.toLowerCase();
    const isSvg = file.type === "image/svg+xml" || name.endsWith(".svg");
    const isDxf = name.endsWith(".dxf");
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    if (!isSvg && !isDxf && !isPdf) {
      setSvgUploadError("Please upload a .svg, .dxf or .pdf file.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setSvgUploadError("Could not read the selected file.");
    reader.onload = async () => {
      if (isPdf) {
        // Convert a vector PDF page to SVG in the browser, then reuse the same
        // preview / insert / publish-to-library flow.
        setSvgUploadError("Converting PDF…");
        try {
          const { pdfToSvg } = await import("@/lib/drawings/pdfToSvg");
          const { svg, pageCount } = await pdfToSvg(reader.result as ArrayBuffer);
          if (!svg || !svg.includes("<svg")) {
            setSvgUploadError("Could not convert that PDF. It may be a scanned/raster PDF rather than a vector drawing.");
            return;
          }
          setSvgUploadError(pageCount > 1 ? `Imported page 1 of ${pageCount}. Split the PDF to import another page.` : null);
          setSvgText(svg);
          setSvgUploadName(file.name);
          setPublishName(file.name.replace(/\.pdf$/i, "") || publishName);
          setPublishDescription("Converted from a vector PDF drawing.");
        } catch {
          setSvgUploadError("That PDF could not be converted. Make sure it is a vector PDF (exported from CAD), not a scan.");
        }
        return;
      }

      const text = typeof reader.result === "string" ? reader.result : "";

      if (isDxf) {
        // Convert the AutoCAD DXF to SVG in the browser, then reuse the same
        // preview / insert / publish-to-library flow as a pasted SVG.
        setSvgUploadError("Converting DXF…");
        try {
          const dxfMod: any = await import("dxf");
          const svg: string = new dxfMod.Helper(text).toSVG();
          if (!svg || !svg.includes("<svg")) {
            setSvgUploadError("Could not convert that DXF. Try exporting a clean 2D DXF (explode blocks, keep text as text).");
            return;
          }
          setSvgUploadError(null);
          setSvgText(svg);
          setSvgUploadName(file.name);
          setPublishName(file.name.replace(/\.dxf$/i, "") || publishName);
          setPublishDescription("Converted from an AutoCAD DXF file.");
        } catch {
          setSvgUploadError("That DXF could not be parsed. Make sure it is a 2D ASCII DXF export, not a binary or 3D drawing.");
        }
        return;
      }

      if (!text.includes("<svg")) {
        setSvgUploadError("That file does not look like valid SVG markup.");
        return;
      }
      setSvgText(text);
      setSvgUploadName(file.name);
      setPublishName(file.name.replace(/\.svg$/i, "") || publishName);
      setPublishDescription("SVG file uploaded into the drawing editor.");
    };
    if (isPdf) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const handleSvgUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleSvgFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleSvgDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleSvgFile(event.dataTransfer.files?.[0]);
  };

  const clearSvgImport = () => {
    setSvgText("");
    setSvgUploadName("");
    setSvgUploadError(null);
  };

  const activeTabLabel = tabs.find((item) => item.id === activeTrayValue)?.label ?? "Drawing tools";
  const isSideLayout = layout === "side";

  const updateTemplateDraft = (key: string, value: number | string) => {
    if (!selectedParametricBlock) return;
    setParametricDraft((current) => ({
      ...((current ?? selectedParametricBlock.params) as TemplateParamValues),
      [key]: value,
    }));
  };

  const renderParametricEditor = () => {
    if (!selectedParametricBlock || !parametricDraft) return null;

    // Registry templates: editor UI generated from the parameter schema.
    const template = TEMPLATE_REGISTRY[selectedParametricBlock.kind];
    if (template) {
      const draft = parametricDraft as TemplateParamValues;
      return (
        <div className="space-y-3 rounded-3xl border border-sky-200 bg-sky-50/60 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Parametric block</p>
            <h3 className="mt-1 text-sm font-semibold text-slate-950">{template.label}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Edit the dimensions and click apply — the drawing regenerates with correct annotations.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {template.params.map((def) =>
              def.type === "number" ? (
                <div key={def.key}>
                  <label className="label">
                    {def.label}
                    {def.unit ? ` (${def.unit})` : ""}
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={def.min}
                    max={def.max}
                    step={def.step ?? (def.integer ? 1 : undefined)}
                    value={String(draft[def.key] ?? def.default)}
                    onChange={(event) => updateTemplateDraft(def.key, event.target.value)}
                  />
                </div>
              ) : (
                <div key={def.key}>
                  <label className="label">{def.label}</label>
                  <select
                    className="input"
                    value={String(draft[def.key] ?? def.default)}
                    onChange={(event) => updateTemplateDraft(def.key, event.target.value)}
                  >
                    {def.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ),
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary" onClick={applyParametricDraft}>Apply changes</button>
            <button className="btn" onClick={resetParametricDraft}>Reset to default</button>
          </div>
        </div>
      );
    }

    if (selectedParametricBlock.kind === "beam-detail") {
      const draft = parametricDraft as BeamDetailParams;
      return (
        <div className="space-y-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-[0_10px_28px_rgba(14,165,233,0.08)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Parametric block</p>
            <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedParametricBlock.label}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Update beam dimensions and reinforcement, then regenerate the selected block in place.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Width (mm)</label>
              <input className="input" type="number" value={draft.widthMm} onChange={(event) => updateBeamDraft("widthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Depth (mm)</label>
              <input className="input" type="number" value={draft.depthMm} onChange={(event) => updateBeamDraft("depthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Top bars</label>
              <input className="input" type="number" value={draft.topBars} onChange={(event) => updateBeamDraft("topBars", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Bottom bars</label>
              <input className="input" type="number" value={draft.bottomBars} onChange={(event) => updateBeamDraft("bottomBars", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Bar dia. (mm)</label>
              <input className="input" type="number" value={draft.barDiaMm} onChange={(event) => updateBeamDraft("barDiaMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Stirrup dia. (mm)</label>
              <input className="input" type="number" value={draft.stirrupDiaMm} onChange={(event) => updateBeamDraft("stirrupDiaMm", Number(event.target.value))} />
            </div>
            <div className="col-span-2">
              <label className="label">Stirrup spacing (mm)</label>
              <input className="input" type="number" value={draft.stirrupSpacingMm} onChange={(event) => updateBeamDraft("stirrupSpacingMm", Number(event.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary" onClick={applyParametricDraft}>Apply changes</button>
            <button className="btn" onClick={resetParametricDraft}>Reset to default</button>
          </div>
        </div>
      );
    }

    if (selectedParametricBlock.kind === "column-detail") {
      const draft = parametricDraft as ColumnDetailParams;
      return (
        <div className="space-y-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-[0_10px_28px_rgba(14,165,233,0.08)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Parametric block</p>
            <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedParametricBlock.label}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Switch between plan and section, update the column size and reinforcement, then regenerate it in place.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">View</label>
              <select className="input" value={draft.view} onChange={(event) => updateColumnDraft("view", event.target.value as StructuralView)}>
                <option value="plan">Plan</option>
                <option value="section">Section</option>
              </select>
            </div>
            <div>
              <label className="label">Storey</label>
              <select className="input" value={draft.storeyMode} onChange={(event) => updateColumnDraft("storeyMode", event.target.value as StoreyMode)}>
                <option value="single">Single storey</option>
                <option value="multi">Multi storey</option>
              </select>
            </div>
            <div>
              <label className="label">Width (mm)</label>
              <input className="input" type="number" value={draft.widthMm} onChange={(event) => updateColumnDraft("widthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Depth (mm)</label>
              <input className="input" type="number" value={draft.depthMm} onChange={(event) => updateColumnDraft("depthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Main bars</label>
              <input className="input" type="number" value={draft.mainBars} onChange={(event) => updateColumnDraft("mainBars", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Bar dia. (mm)</label>
              <input className="input" type="number" value={draft.barDiaMm} onChange={(event) => updateColumnDraft("barDiaMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Tie dia. (mm)</label>
              <input className="input" type="number" value={draft.tieDiaMm} onChange={(event) => updateColumnDraft("tieDiaMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Tie spacing (mm)</label>
              <input className="input" type="number" value={draft.tieSpacingMm} onChange={(event) => updateColumnDraft("tieSpacingMm", Number(event.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary" onClick={applyParametricDraft}>Apply changes</button>
            <button className="btn" onClick={resetParametricDraft}>Reset to default</button>
          </div>
        </div>
      );
    }

    if (selectedParametricBlock.kind === "footing-detail") {
      const draft = parametricDraft as FootingDetailParams;
      return (
        <div className="space-y-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-[0_10px_28px_rgba(14,165,233,0.08)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Parametric block</p>
            <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedParametricBlock.label}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Use one compact footing block for plan or section, then tune the footing, column, and reinforcement values.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">View</label>
              <select className="input" value={draft.view} onChange={(event) => updateFootingDraft("view", event.target.value as StructuralView)}>
                <option value="plan">Plan</option>
                <option value="section">Section</option>
              </select>
            </div>
            <div>
              <label className="label">Bar dia. (mm)</label>
              <input className="input" type="number" value={draft.barDiaMm} onChange={(event) => updateFootingDraft("barDiaMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Footing width (mm)</label>
              <input className="input" type="number" value={draft.footingWidthMm} onChange={(event) => updateFootingDraft("footingWidthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Footing length (mm)</label>
              <input className="input" type="number" value={draft.footingLengthMm} onChange={(event) => updateFootingDraft("footingLengthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Footing depth (mm)</label>
              <input className="input" type="number" value={draft.footingDepthMm} onChange={(event) => updateFootingDraft("footingDepthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Column width (mm)</label>
              <input className="input" type="number" value={draft.columnWidthMm} onChange={(event) => updateFootingDraft("columnWidthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Column depth (mm)</label>
              <input className="input" type="number" value={draft.columnDepthMm} onChange={(event) => updateFootingDraft("columnDepthMm", Number(event.target.value))} />
            </div>
            <div>
              <label className="label">Bars X</label>
              <input className="input" type="number" value={draft.barCountX} onChange={(event) => updateFootingDraft("barCountX", Number(event.target.value))} />
            </div>
            <div className="col-span-2">
              <label className="label">Bars Y</label>
              <input className="input" type="number" value={draft.barCountY} onChange={(event) => updateFootingDraft("barCountY", Number(event.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary" onClick={applyParametricDraft}>Apply changes</button>
            <button className="btn" onClick={resetParametricDraft}>Reset to default</button>
          </div>
        </div>
      );
    }

    const draft = parametricDraft as WallOpeningParams;
    return (
      <div className="space-y-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-[0_10px_28px_rgba(14,165,233,0.08)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Parametric block</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-950">{selectedParametricBlock.label}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Update wall and opening dimensions, then regenerate the selected block in place.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Wall length (mm)</label>
            <input className="input" type="number" value={draft.wallLengthMm} onChange={(event) => updateWallDraft("wallLengthMm", Number(event.target.value))} />
          </div>
          <div>
            <label className="label">Wall thickness (mm)</label>
            <input className="input" type="number" value={draft.wallThicknessMm} onChange={(event) => updateWallDraft("wallThicknessMm", Number(event.target.value))} />
          </div>
          <div>
            <label className="label">Opening type</label>
            <select className="input" value={draft.openingType} onChange={(event) => updateWallDraft("openingType", event.target.value as WallOpeningParams["openingType"])}>
              <option value="door">Door</option>
              <option value="window">Window</option>
              <option value="opening">Opening</option>
            </select>
          </div>
          <div>
            <label className="label">Opening width (mm)</label>
            <input className="input" type="number" value={draft.openingWidthMm} onChange={(event) => updateWallDraft("openingWidthMm", Number(event.target.value))} />
          </div>
          <div className="col-span-2">
            <label className="label">Opening offset (mm)</label>
            <input className="input" type="number" value={draft.openingOffsetMm} onChange={(event) => updateWallDraft("openingOffsetMm", Number(event.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary" onClick={applyParametricDraft}>Apply changes</button>
          <button className="btn" onClick={resetParametricDraft}>Reset to default</button>
        </div>
      </div>
    );
  };

  if (isSideLayout && !activeTrayValue) return null;

  return (
    <section
      className={
        isSideLayout
          ? "relative z-30 flex h-full w-[320px] shrink-0 flex-col border-r border-slate-800 bg-slate-900 shadow-[10px_0_30px_rgba(0,0,0,0.22)]"
          : "relative z-30 border-b border-slate-200/80 bg-white/90 px-4 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl"
      }
    >
      <div className={isSideLayout ? "hidden" : "flex flex-wrap items-center gap-2"}>
        <div className={isSideLayout ? "mb-2 text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500" : "mr-2 hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500 lg:flex"}>
          Drawing trays
        </div>
        {tabs.map((item) => (
          <button
            key={item.id}
            className={`rounded-xl text-xs font-semibold transition ${
              isSideLayout ? "flex h-12 w-12 items-center justify-center px-1 py-1 text-[10px]" : "px-3 py-2"
            } ${
              activeTrayValue === item.id
                ? "bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
            onClick={() => setTray(activeTrayValue === item.id ? null : item.id)}
            title={item.label}
          >
            {isSideLayout ? item.short : item.label}
          </button>
        ))}

        <div className={isSideLayout ? "mt-auto flex flex-col items-center gap-2" : "ml-auto flex flex-wrap items-center gap-2"}>
          {statusMessage ? (
            <div className={isSideLayout ? "hidden" : "max-w-[420px] truncate rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-900"}>
              {statusMessage}
            </div>
          ) : null}
          <div className={isSideLayout ? "rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-center text-[10px] font-semibold text-slate-600" : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600"}>
            {isSideLayout ? "Sel" : "Selection"}: <span className="text-slate-900">{selectedCount}</span>
          </div>
          {activeTrayValue ? (
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              onClick={() => setTray(null)}
            >
              Close tray
            </button>
          ) : null}
        </div>
      </div>

      {activeTrayValue ? (
        <div
          className={
            isSideLayout
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "absolute left-4 right-4 top-[calc(100%-1px)] z-40 mt-2 overflow-hidden rounded-[28px] border border-slate-200 bg-white/96 shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl"
          }
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                {activeTabLabel}
              </p>
              <h2 className="text-sm font-semibold text-slate-900">
                {isAdmin ? "Drafting, SVG import, projects, and publishing" : "Drafting, SVG import, library, and project tools"}
              </h2>
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 transition hover:border-sky-500/60 hover:bg-sky-500/15 hover:text-sky-300"
              onClick={() => setTray(null)}
              title="Hide side panel"
              aria-label="Hide side panel"
            >
              <Layers3 className="h-5 w-5" />
            </button>
          </div>
          <div className={isSideLayout ? "min-h-0 flex-1 overflow-y-auto px-3 py-4" : "max-h-[min(520px,calc(100vh-230px))] overflow-y-auto px-5 py-5"}>
        {tab === "properties" ? (
          <div className="space-y-5">
            {renderParametricEditor()}

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Text and dimension labels</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Adjust selected labels, dimension text, or text inside grouped drawing blocks.
                </p>
              </div>

              <div className={selectedTextStyle.hasText ? "space-y-4" : "pointer-events-none space-y-4 opacity-50"}>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                  <button className="btn h-11 px-3" onClick={() => applyFontSize(fontSize - 1)}>
                    -
                  </button>
                  <div>
                    <label className="label">Font size ({fontSize.toFixed(0)})</label>
                    <input
                      type="range"
                      min="4"
                      max="96"
                      step="1"
                      value={fontSize}
                      onChange={(event) => applyFontSize(parseFloat(event.target.value))}
                      className="w-full accent-slate-900"
                    />
                  </div>
                  <button className="btn h-11 px-3" onClick={() => applyFontSize(fontSize + 1)}>
                    +
                  </button>
                </div>

                <div>
                  <label className="label">Font color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={fontColor}
                      onChange={(event) => applyFontColor(event.target.value)}
                      className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1"
                    />
                    <input
                      className="input font-mono uppercase"
                      value={fontColor}
                      onChange={(event) => applyFontColor(event.target.value)}
                    />
                  </div>
                </div>
              </div>

              {!selectedTextStyle.hasText ? (
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Select text or a dimension label to edit font style.
                </p>
              ) : null}
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Color and shading</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Apply solid fills or technical hatch patterns to selected objects.
                </p>
              </div>

              <div>
                <label className="label">Fill / hatch color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={hatchColor}
                    onChange={(event) => setHatchColor(event.target.value)}
                    className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1"
                  />
                  <input
                    className="input font-mono uppercase"
                    value={hatchColor}
                    onChange={(event) => setHatchColor(event.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label">Shading scale ({hatchScale.toFixed(1)})</label>
                <input
                  type="range"
                  min="0.3"
                  max="4"
                  step="0.1"
                  value={hatchScale}
                  onChange={(event) => setHatchScale(parseFloat(event.target.value))}
                  className="w-full accent-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={() => onApplyPattern("solid", hatchScale, hatchColor)}>
                  Solid fill
                </button>
                {PATTERNS.map((pattern) => (
                  <button key={pattern.id} className="btn justify-start" onClick={() => onApplyPattern(pattern.id, hatchScale, hatchColor)}>
                    {pattern.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Stroke and line weight</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Control outlines for selected geometry, symbols, and detail blocks.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(event) => {
                    setStrokeColor(event.target.value);
                    onUpdateStroke(event.target.value, strokeWidth, hasStroke);
                  }}
                  className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1"
                />
                <input
                  type="range"
                  min="0.5"
                  max="40"
                  step="0.5"
                  value={strokeWidth}
                  onChange={(event) => {
                    const next = parseFloat(event.target.value);
                    setStrokeWidth(next);
                    onUpdateStroke(strokeColor, next, hasStroke);
                  }}
                  className="w-full accent-slate-900"
                />
                <span className="w-12 text-right text-sm font-semibold text-slate-700">{strokeWidth.toFixed(1)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`btn ${hasStroke ? "btn-primary" : ""}`}
                  onClick={() => {
                    setHasStroke(true);
                    onUpdateStroke(strokeColor, strokeWidth, true);
                  }}
                >
                  Stroke on
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setHasStroke(false);
                    onUpdateStroke(strokeColor, strokeWidth, false);
                  }}
                >
                  Stroke off
                </button>
              </div>

              <div>
                <label className="label">Line type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`btn ${lineStyle === "solid" ? "btn-primary" : ""}`}
                    onClick={() => applyLineStyle("solid")}
                  >
                    Solid
                  </button>
                  <button
                    className={`btn ${lineStyle === "dashed" ? "btn-primary" : ""}`}
                    onClick={() => applyLineStyle("dashed")}
                  >
                    Dashed
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Sheet and title block</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Drawing metadata used in exports and title blocks.
                </p>
              </div>
              <div>
                <label className="label">Drawing title</label>
                <input className="input" value={titleBlockData.drawingTitle} onChange={(event) => updateTitleBlock("drawingTitle", event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Drawing no.</label>
                  <input className="input" value={titleBlockData.drawingNo} onChange={(event) => updateTitleBlock("drawingNo", event.target.value)} />
                </div>
                <div>
                  <label className="label">Revision</label>
                  <input className="input" value={titleBlockData.revision} onChange={(event) => updateTitleBlock("revision", event.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={onApplyTitleBlock}>
                  Apply title block
                </button>
                <button className="btn btn-danger" onClick={onRemoveTitleBlock}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "library" ? (
          <div className="space-y-5">
            <div className="space-y-3">
              <div>
                <label className="label">Search library</label>
                <input
                  className="input"
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder="Search layouts, symbols, equipment"
                />
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  className="input"
                  value={libraryCategory}
                  onChange={(event) => setLibraryCategory(event.target.value as LibraryCategory | "all")}
                >
                  <option value="all">All categories</option>
                  {LIBRARY_CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
              {[
                { id: "all" as const, label: "All" },
                { id: "object" as const, label: "Objects" },
                { id: "drawing" as const, label: "Templates" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setAssetFilter(filter.id)}
                  className={`rounded-md px-3 py-1.5 transition ${
                    assetFilter === filter.id
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {favoriteItems.length > 0 ? (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Favorites
                </div>
                <div className="space-y-1.5">
                  {favoriteItems.map((item) => (
                    <button
                      key={`fav-${item.id}`}
                      type="button"
                      onClick={() => handleInsertLibraryItem(item)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-left transition hover:bg-amber-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
                        <div className="truncate text-[11px] text-slate-500">
                          {item.category} · {item.assetType === "drawing" ? "Template" : "Object"}
                        </div>
                      </div>
                      <span className="text-amber-500" aria-hidden>★</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {recentItems.length > 0 ? (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Recently used
                </div>
                <div className="space-y-1.5">
                  {recentItems.map((item) => (
                    <button
                      key={`recent-${item.id}`}
                      type="button"
                      onClick={() => handleInsertLibraryItem(item)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
                        <div className="truncate text-[11px] text-slate-500">
                          {item.category} · {item.assetType === "drawing" ? "Template" : "Object"}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400">Insert</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {(favoriteItems.length > 0 || recentItems.length > 0) && (
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  All {assetFilter === "drawing" ? "templates" : assetFilter === "object" ? "objects" : "items"}
                </div>
              )}
              {filteredItems.map((item) => {
                const isFavorite = favoriteIds.includes(item.id);
                return (
                  <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
                          <button
                            type="button"
                            onClick={() => onToggleFavorite(item.id)}
                            className={`shrink-0 text-base leading-none transition ${
                              isFavorite ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-500"
                            }`}
                            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                          >
                            {isFavorite ? "★" : "☆"}
                          </button>
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                          {item.category} · {item.assetType === "drawing" ? "Template" : "Object"} ·{" "}
                          {item.source === "personal"
                            ? "My library"
                            : item.source === "admin"
                              ? "Shared admin library"
                              : "System starter"}
                        </div>
                        {item.parametricKind ? (
                          <div className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                            Editable dimensions
                          </div>
                        ) : null}
                      </div>
                      <button className="btn btn-primary shrink-0" onClick={() => handleInsertLibraryItem(item)}>
                        Insert
                      </button>
                    </div>
                    <div className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/svg+xml;utf8,${encodeURIComponent(item.svg)}`}
                        alt={item.name}
                        className="max-h-full max-w-full"
                        loading="lazy"
                      />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <span key={`${item.id}-${tag}`} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      Updated {new Date(item.updatedAt).toLocaleDateString()} by {item.author}
                    </div>
                  </div>
                );
              })}

              {filteredItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No library {assetFilter === "drawing" ? "templates" : assetFilter === "object" ? "objects" : "items"} match the current search.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "details" ? (
          <div className="space-y-6">
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <label className="label">Project name</label>
                <input
                  className="input"
                  value={projectName}
                  onChange={(event) => onProjectNameChange(event.target.value)}
                  placeholder="Project name"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={onSaveProject}>
                  Save project
                </button>
                <button className="btn" onClick={onApplyTitleBlock}>
                  Refresh title block
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Beam detailing</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Generate a full editable beam detail from just the beam size and reinforcement values.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Width mm</label>
                  <input className="input" type="number" value={beamWidth} onChange={(event) => setNumber(setBeamWidth)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Depth mm</label>
                  <input className="input" type="number" value={beamDepth} onChange={(event) => setNumber(setBeamDepth)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Top bars</label>
                  <input className="input" type="number" value={beamTopBars} onChange={(event) => setNumber(setBeamTopBars)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Bottom bars</label>
                  <input className="input" type="number" value={beamBottomBars} onChange={(event) => setNumber(setBeamBottomBars)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Main bar dia</label>
                  <input className="input" type="number" value={beamBarDia} onChange={(event) => setNumber(setBeamBarDia)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Stirrup dia</label>
                  <input className="input" type="number" value={beamStirrupDia} onChange={(event) => setNumber(setBeamStirrupDia)(event.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="label">Stirrup spacing mm</label>
                  <input className="input" type="number" value={beamStirrupSpacing} onChange={(event) => setNumber(setBeamStirrupSpacing)(event.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn"
                  onClick={() => {
                    setBeamWidth(400);
                    setBeamDepth(400);
                    setBeamTopBars(2);
                    setBeamBottomBars(3);
                    setBeamBarDia(16);
                    setBeamStirrupDia(8);
                    setBeamStirrupSpacing(150);
                  }}
                >
                  400 x 400 preset
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setBeamWidth(200);
                    setBeamDepth(200);
                    setBeamTopBars(2);
                    setBeamBottomBars(2);
                    setBeamBarDia(12);
                    setBeamStirrupDia(8);
                    setBeamStirrupSpacing(150);
                  }}
                >
                  200 x 200 preset
                </button>
                <button className="btn btn-primary col-span-2" onClick={insertBeamDetail}>
                  Insert beam detailing
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Column detailing</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Use one simple block for column plan or section, then edit the same inserted block later from Properties.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">View</label>
                  <select className="input" value={columnView} onChange={(event) => setColumnView(event.target.value as StructuralView)}>
                    <option value="plan">Plan</option>
                    <option value="section">Section</option>
                  </select>
                </div>
                <div>
                  <label className="label">Storey</label>
                  <select className="input" value={columnStoreyMode} onChange={(event) => setColumnStoreyMode(event.target.value as StoreyMode)}>
                    <option value="single">Single storey</option>
                    <option value="multi">Multi storey</option>
                  </select>
                </div>
                <div>
                  <label className="label">Column width</label>
                  <input className="input" type="number" value={columnWidth} onChange={(event) => setNumber(setColumnWidth)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Column depth</label>
                  <input className="input" type="number" value={columnDepth} onChange={(event) => setNumber(setColumnDepth)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Main bars</label>
                  <input className="input" type="number" value={columnBars} onChange={(event) => setNumber(setColumnBars)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Bar dia</label>
                  <input className="input" type="number" value={columnBarDia} onChange={(event) => setNumber(setColumnBarDia)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Tie dia</label>
                  <input className="input" type="number" value={columnTieDia} onChange={(event) => setNumber(setColumnTieDia)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Tie spacing</label>
                  <input className="input" type="number" value={columnTieSpacing} onChange={(event) => setNumber(setColumnTieSpacing)(event.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn" onClick={() => {
                  setColumnView("plan");
                  setColumnWidth(300);
                  setColumnDepth(300);
                  setColumnBars(8);
                  setColumnBarDia(16);
                  setColumnTieDia(8);
                  setColumnTieSpacing(150);
                  setColumnStoreyMode("single");
                }}>
                  300 x 300 preset
                </button>
                <button className="btn" onClick={() => {
                  setColumnView("section");
                  setColumnWidth(230);
                  setColumnDepth(300);
                  setColumnBars(6);
                  setColumnBarDia(16);
                  setColumnTieDia(8);
                  setColumnTieSpacing(150);
                  setColumnStoreyMode("multi");
                }}>
                  Section preset
                </button>
                <button className="btn btn-primary col-span-2" onClick={insertColumnDetail}>
                  Insert column detailing
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Column footing detailing</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Create either the footing plan or the cross section from one compact form.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">View</label>
                  <select className="input" value={footingView} onChange={(event) => setFootingView(event.target.value as StructuralView)}>
                    <option value="plan">Plan</option>
                    <option value="section">Cross section</option>
                  </select>
                </div>
                <div>
                  <label className="label">Bar dia</label>
                  <input className="input" type="number" value={footingBarDia} onChange={(event) => setNumber(setFootingBarDia)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Footing width</label>
                  <input className="input" type="number" value={footingWidth} onChange={(event) => setNumber(setFootingWidth)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Footing length</label>
                  <input className="input" type="number" value={footingLength} onChange={(event) => setNumber(setFootingLength)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Footing depth</label>
                  <input className="input" type="number" value={footingDepth} onChange={(event) => setNumber(setFootingDepth)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Column width</label>
                  <input className="input" type="number" value={footingColumnWidth} onChange={(event) => setNumber(setFootingColumnWidth)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Column depth</label>
                  <input className="input" type="number" value={footingColumnDepth} onChange={(event) => setNumber(setFootingColumnDepth)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Bars X / Y</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input" type="number" value={footingBarCountX} onChange={(event) => setNumber(setFootingBarCountX)(event.target.value)} />
                    <input className="input" type="number" value={footingBarCountY} onChange={(event) => setNumber(setFootingBarCountY)(event.target.value)} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn" onClick={() => {
                  setFootingView("plan");
                  setFootingWidth(1800);
                  setFootingLength(1800);
                  setFootingDepth(500);
                  setFootingColumnWidth(300);
                  setFootingColumnDepth(300);
                  setFootingBarDia(16);
                  setFootingBarCountX(7);
                  setFootingBarCountY(7);
                }}>
                  Plan preset
                </button>
                <button className="btn" onClick={() => {
                  setFootingView("section");
                  setFootingWidth(2000);
                  setFootingLength(1800);
                  setFootingDepth(550);
                  setFootingColumnWidth(300);
                  setFootingColumnDepth(300);
                  setFootingBarDia(16);
                  setFootingBarCountX(8);
                  setFootingBarCountY(8);
                }}>
                  Section preset
                </button>
                <button className="btn btn-primary col-span-2" onClick={insertFootingDetail}>
                  Insert footing detailing
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Wall, door, and window blocks</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Keep wall openings lightweight with a simple hosted wall segment or a ready door/window block.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Wall length</label>
                  <input className="input" type="number" value={wallLength} onChange={(event) => setNumber(setWallLength)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Thickness</label>
                  <input className="input" type="number" value={wallThickness} onChange={(event) => setNumber(setWallThickness)(event.target.value)} />
                </div>
                <div>
                  <label className="label">Opening type</label>
                  <select className="input" value={openingType} onChange={(event) => setOpeningType(event.target.value as OpeningType)}>
                    <option value="door">Door</option>
                    <option value="window">Window</option>
                    <option value="opening">Opening</option>
                  </select>
                </div>
                <div>
                  <label className="label">Opening width</label>
                  <input className="input" type="number" value={openingWidth} onChange={(event) => setNumber(setOpeningWidth)(event.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="label">Offset from wall start</label>
                  <input className="input" type="number" value={openingOffset} onChange={(event) => setNumber(setOpeningOffset)(event.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn" onClick={() => onAddParametricBlock("door-opening", { openingWidthMm: 900 })}>
                  Door block
                </button>
                <button className="btn" onClick={() => onAddParametricBlock("window-opening", { openingWidthMm: 1200 })}>
                  Window block
                </button>
                <button className="btn btn-primary col-span-2" onClick={insertWallOpening}>
                  Insert hosted opening wall
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">SVG import</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Upload an SVG file or paste SVG markup, render it onto the canvas, and continue editing with the drafting tools.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {ADMIN_SVG_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className="btn justify-between"
                    onClick={() => {
                      setSvgText(template.svg);
                      setPublishName(template.name);
                      setPublishCategory(template.category);
                      setPublishDescription(template.description);
                    }}
                  >
                    <span>{template.name}</span>
                    <span className="text-[11px] text-slate-500">{template.category}</span>
                  </button>
                ))}
              </div>

              <div
                className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleSvgDrop}
              >
                <input
                  ref={svgFileInputRef}
                  type="file"
                  accept=".svg,.dxf,.pdf,image/svg+xml,application/pdf"
                  className="hidden"
                  onChange={handleSvgUploadChange}
                />
                <p className="text-sm font-semibold text-slate-900">Upload SVG, DXF or PDF file</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Choose or drag a .svg, AutoCAD .dxf, or vector .pdf file here. DXF and vector PDF are converted to an editable drawing; review it below, then insert or publish to the library.
                </p>
                {svgUploadName ? (
                  <p className="mt-2 text-xs font-semibold text-sky-600">Loaded: {svgUploadName}</p>
                ) : null}
                {svgUploadError ? (
                  <p className="mt-2 text-xs font-semibold text-red-500">{svgUploadError}</p>
                ) : null}
                <button className="btn mt-3" type="button" onClick={() => svgFileInputRef.current?.click()}>
                  Select SVG / DXF / PDF file
                </button>
              </div>

              <div>
                <label className="label">SVG code</label>
                <textarea
                  className="input min-h-[220px] resize-y font-mono text-xs leading-6"
                  value={svgText}
                  onChange={(event) => setSvgText(event.target.value)}
                  placeholder='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">...</svg>'
                  spellCheck={false}
                />
              </div>

              {svgText.trim().includes("<svg") ? (
                <div>
                  <label className="label">Live preview</label>
                  <div className="flex h-44 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`}
                      alt="SVG preview"
                      className="max-h-full max-w-full"
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={() => svgText.trim() && onAddSvg(svgText)}>
                  Insert SVG
                </button>
                <button className="btn" onClick={clearSvgImport}>
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Quick detail blocks</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Add common drafting references without leaving the canvas.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DETAIL_BLOCKS.map((item) => (
                  <button key={item.id} className="btn justify-start" onClick={() => onAddSvg(item.svg)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Title block and sheet data</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Keep drawing metadata consistent before saving or exporting.
                </p>
              </div>

              <div>
                <label className="label">Project title</label>
                <input className="input" value={titleBlockData.projectTitle} onChange={(event) => updateTitleBlock("projectTitle", event.target.value)} />
              </div>
              <div>
                <label className="label">Drawing title</label>
                <input className="input" value={titleBlockData.drawingTitle} onChange={(event) => updateTitleBlock("drawingTitle", event.target.value)} />
              </div>
              <div>
                <label className="label">Client</label>
                <input className="input" value={titleBlockData.client} onChange={(event) => updateTitleBlock("client", event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Drawing number</label>
                  <input className="input" value={titleBlockData.drawingNo} onChange={(event) => updateTitleBlock("drawingNo", event.target.value)} />
                </div>
                <div>
                  <label className="label">Revision</label>
                  <input className="input" value={titleBlockData.revision} onChange={(event) => updateTitleBlock("revision", event.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Scale</label>
                  <input className="input" value={titleBlockData.scale} onChange={(event) => updateTitleBlock("scale", event.target.value)} />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={titleBlockData.date} onChange={(event) => updateTitleBlock("date", event.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Drawn by</label>
                  <input className="input" value={titleBlockData.drawnBy} onChange={(event) => updateTitleBlock("drawnBy", event.target.value)} />
                </div>
                <div>
                  <label className="label">Checked by</label>
                  <input className="input" value={titleBlockData.checkedBy} onChange={(event) => updateTitleBlock("checkedBy", event.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Sheet reference</label>
                <input className="input" value={titleBlockData.sheet} onChange={(event) => updateTitleBlock("sheet", event.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-primary" onClick={onApplyTitleBlock}>
                  Apply title block
                </button>
                <button className="btn btn-danger" onClick={onRemoveTitleBlock}>
                  Remove
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Fill, hatch, and stroke</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Apply fills to the selected object or ungroup a library block to style sub-elements.
                </p>
              </div>

              <div>
                <label className="label">Fill color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={hatchColor} onChange={(event) => setHatchColor(event.target.value)} className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1" />
                  <input className="input font-mono uppercase" value={hatchColor} onChange={(event) => setHatchColor(event.target.value)} />
                </div>
              </div>

              <div>
                <label className="label">Pattern scale ({hatchScale.toFixed(1)})</label>
                <input
                  type="range"
                  min="0.3"
                  max="4"
                  step="0.1"
                  value={hatchScale}
                  onChange={(event) => setHatchScale(parseFloat(event.target.value))}
                  className="w-full accent-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn" onClick={() => onApplyPattern("solid", hatchScale, hatchColor)}>
                  Solid fill
                </button>
                {PATTERNS.map((pattern) => (
                  <button key={pattern.id} className="btn justify-start" onClick={() => onApplyPattern(pattern.id, hatchScale, hatchColor)}>
                    {pattern.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Stroke</span>
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${hasStroke ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                    onClick={() => {
                      const next = !hasStroke;
                      setHasStroke(next);
                      onUpdateStroke(strokeColor, strokeWidth, next);
                    }}
                  >
                    {hasStroke ? "Enabled" : "Disabled"}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(event) => {
                      setStrokeColor(event.target.value);
                      onUpdateStroke(event.target.value, strokeWidth, hasStroke);
                    }}
                    className="h-11 w-11 rounded-xl border border-slate-200 bg-white p-1"
                  />
                  <input
                    type="range"
                    min="0.5"
                    max="40"
                    step="0.5"
                    value={strokeWidth}
                    onChange={(event) => {
                      const next = parseFloat(event.target.value);
                      setStrokeWidth(next);
                      onUpdateStroke(strokeColor, next, hasStroke);
                    }}
                    className="w-full accent-slate-900"
                  />
                  <span className="w-12 text-right text-sm text-slate-600">{strokeWidth.toFixed(1)}</span>
                </div>
                <div>
                  <label className="label">Line type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`btn ${lineStyle === "solid" ? "btn-primary" : ""}`}
                      onClick={() => applyLineStyle("solid")}
                    >
                      Solid
                    </button>
                    <button
                      className={`btn ${lineStyle === "dashed" ? "btn-primary" : ""}`}
                      onClick={() => applyLineStyle("dashed")}
                    >
                      Dashed
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "projects" ? (
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <h3 className="text-sm font-semibold text-slate-900">Saved drawing packages</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Save multi-sheet projects to Supabase, reopen them later from any signed-in session, and keep editing.
              </p>
              <button className="btn btn-primary mt-4 w-full" onClick={onSaveProject}>
                Save current project
              </button>
            </div>

            <div className="space-y-3">
              {savedProjects.map((project) => (
                <div
                  key={project.id}
                  className={`rounded-3xl border p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] ${
                    activeProjectId === project.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{project.name}</div>
                      <div className={`mt-1 text-xs ${activeProjectId === project.id ? "text-slate-300" : "text-slate-500"}`}>
                        {project.pages.length} sheet{project.pages.length > 1 ? "s" : ""} · {project.owner}
                      </div>
                    </div>
                    <button
                      className={`btn ${activeProjectId === project.id ? "!border-white/30 !bg-white/10 !text-white hover:!bg-white/20" : ""}`}
                      onClick={() => onOpenProject(project)}
                    >
                      Open
                    </button>
                  </div>
                  <div className={`mt-3 text-xs ${activeProjectId === project.id ? "text-slate-300" : "text-slate-500"}`}>
                    Last saved {new Date(project.updatedAt).toLocaleString()}
                  </div>
                    <button
                    className={`btn btn-danger mt-3 ${activeProjectId === project.id ? "!border-red-300/30 !bg-red-500/15 !text-red-100" : ""}`}
                    onClick={() => onDeleteProject(project.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}

              {savedProjects.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No saved projects yet. Save the current drawing package to build your workspace library.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "admin" && isAdmin ? (
          <div className="space-y-6">
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
                Shared library publishing
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                All signed-in users can import raw SVG into their own drawing workspace. This panel is reserved for publishing approved drawings into the shared engineering library.
              </p>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Publish to shared library</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Publish either the current SVG draft or the active canvas as a reusable drawing block for engineers across the platform.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Library name</label>
                  <input className="input" value={publishName} onChange={(event) => setPublishName(event.target.value)} />
                </div>
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={publishCategory} onChange={(event) => setPublishCategory(event.target.value as LibraryCategory)}>
                    {LIBRARY_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-[90px] resize-y" value={publishDescription} onChange={(event) => setPublishDescription(event.target.value)} />
              </div>

              <div>
                <label className="label">Tags</label>
                <input
                  className="input"
                  value={publishTags}
                  onChange={(event) => setPublishTags(event.target.value)}
                  placeholder="layout, equipment, section"
                />
              </div>

              {svgText.trim().includes("<svg") ? (
                <div>
                  <label className="label">Publish preview</label>
                  <div className="flex h-44 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`}
                      alt="Publish preview"
                      className="max-h-full max-w-full"
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    This is what engineers will see in the shared library. Paste SVG in the Tools tab to change it.
                  </p>
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                  No SVG draft loaded. Paste or upload SVG markup in the Tools tab — a live preview will appear here before you publish.
                </p>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    onPublishRawSvg({
                      name: publishName,
                      category: publishCategory,
                      description: publishDescription,
                      tags: parseTags(publishTags),
                      svg: svgText,
                    })
                  }
                >
                  Publish raw SVG
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    onPublishCanvasToLibrary({
                      name: `${publishName} Canvas`,
                      category: publishCategory,
                      description: publishDescription,
                      tags: parseTags(publishTags),
                    })
                  }
                >
                  Publish current canvas
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setPublishName("Library Drawing");
                    setPublishDescription("Editable drawing block prepared by the admin studio.");
                    setPublishTags("library, editable, drawing");
                  }}
                >
                  Reset publish form
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Manage published items</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Load an item back into the publish form to revise it, or remove it from the library. Built-in system parts cannot be removed.
                </p>
              </div>
              <div className="space-y-2">
                {libraryItems.filter((item) => item.source !== "seed").map((item) => (
                  <div key={`manage-${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
                      <div className="truncate text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {item.category} · {item.source === "admin" ? "Shared" : "Personal"}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        className="btn"
                        onClick={() => {
                          setSvgText(item.svg);
                          setPublishName(item.name);
                          setPublishCategory(item.category);
                          setPublishDescription(item.description);
                          setPublishTags(item.tags.join(", "));
                        }}
                      >
                        Load
                      </button>
                      <button className="btn btn-danger" onClick={() => onDeleteLibraryItem(item)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {libraryItems.every((item) => item.source === "seed") ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                    No admin or personal items published yet.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
