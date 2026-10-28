import React, { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  MousePointerClick,
  Plus,
  RotateCcw,
  Spline,
  CornerDownRight,
  PenTool,
  Combine,
  Split,
  WandSparkles,
  ArrowUpFromLine,
  Loader2,
  Trash2,
  Rows3,
  Columns3,
  MoveHorizontal,
  MoveVertical,
} from "lucide-react";
import { toast } from "sonner";
import type { Page, Paint, SceneNode, SigmaDoc, Transition } from "@/lib/types";
import { FONT_FAMILIES, FONT_WEIGHTS, createNode, defaultGradient, getPage, nodeAABB } from "@/lib/nodes";
import { allVectorPoints, canConvertToVector, cornerPoint, removePoint, shapeToVector, smoothPoint, subpathPatch, vectorSubpaths } from "@/lib/vector";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import { uploadImage } from "@/lib/api";
import { cn, clamp, downloadDataUrl, round } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ColorSwatch,
  HexInput,
  InlineInput,
  NumberField,
  Section,
  SectionEmpty,
  Segmented,
} from "./controls";

export function PropertiesPanel({ page, readOnly, doc }: { page: Page; readOnly: boolean; doc: SigmaDoc }) {
  const t = useT();
  const selection = useEditor((s) => s.selection);
  const selected = selection.map((id) => page.nodes[id]).filter(Boolean);
  const single = selected.length === 1 ? selected[0] : null;
  const [tab, setTab] = useState<"design" | "prototype">("design");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-panel-border px-3 py-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "design" | "prototype")}>
          <TabsList>
            <TabsTrigger value="design">{t("Design")}</TabsTrigger>
            <TabsTrigger value="prototype">{t("Prototype")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-[10px] text-muted-foreground">
          {selected.length > 1 ? t("{count} selected", { count: selected.length }) : single ? single.type : t("Page")}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "design" ? (
          <DesignTab page={page} selected={selected} single={single} readOnly={readOnly} />
        ) : (
          <PrototypeTab page={page} single={single} readOnly={readOnly} doc={doc} />
        )}
      </div>
    </div>
  );
}

function DesignTab({
  page,
  selected,
  single,
  readOnly,
}: {
  page: Page;
  selected: SceneNode[];
  single: SceneNode | null;
  readOnly: boolean;
}) {
  const t = useT();
  const updateNodes = useEditor((s) => s.updateNodes);
  const pushHistory = useEditor((s) => s.pushHistory);
  const align = useEditor((s) => s.align);
  const distribute = useEditor((s) => s.distribute);
  const ids = selected.map((n) => n.id);
  const begin = () => pushHistory();
  const live = (patch: Partial<SceneNode>) => updateNodes(ids, patch, false);
  const apply = (patch: Partial<SceneNode>) => updateNodes(ids, patch, true);

  if (!single) {
    return (
      <>
        <AlignSection count={selected.length} onAlign={align} onDistribute={distribute} />
        {selected.length > 1 && <PathfinderSection readOnly={readOnly} />}
        {selected.length > 1 && (
          <Section title={t("Selection")}>
            <SelectionBounds page={page} ids={ids} />
          </Section>
        )}
        {selected.length > 1 && (
          <>
            <FillSection paint={selected[0]?.fill ?? null} onChange={(paint) => apply({ fill: paint })} readOnly={readOnly} title={t("Fill")} />
            <AppearanceSection
              opacity={selected[0]?.opacity ?? 1}
              onLive={(opacity) => live({ opacity })}
              onBegin={begin}
              readOnly={readOnly}
            />
          </>
        )}
        {selected.length === 0 && <PageInfo page={page} />}
        {selected.length > 0 && <ExportSection page={page} selected={selected} />}
      </>
    );
  }

  const node = single;
  const isFrame = node.type === "frame";
  const isGroup = node.type === "group";
  const bounds = isGroup ? nodeAABB(page, node) : null;

  return (
    <div className={cn(readOnly && "pointer-events-none opacity-60")}>
      <AlignSection count={selected.length} onAlign={align} onDistribute={distribute} />

      <Section title={t("Position & size")}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            icon="X"
            value={isGroup ? bounds!.x : node.x}
            min={-100000}
            onFocus={begin}
            disabled={isGroup}
            onChange={(value) => (isGroup ? undefined : live({ x: value }))}
          />
          <NumberField
            icon="Y"
            value={isGroup ? bounds!.y : node.y}
            min={-100000}
            onFocus={begin}
            disabled={isGroup}
            onChange={(value) => (isGroup ? undefined : live({ y: value }))}
          />
          <NumberField
            icon="W"
            value={isGroup ? bounds!.width : node.width}
            min={1}
            onFocus={begin}
            disabled={isGroup}
            onChange={(value) => (isGroup ? undefined : live({ width: value }))}
          />
          <NumberField
            icon="H"
            value={isGroup ? bounds!.height : node.height}
            min={isGroup ? 0 : 1}
            onFocus={begin}
            disabled={isGroup}
            onChange={(value) => (isGroup ? undefined : live({ height: value }))}
          />
          <NumberField
            icon="∠"
            value={node.rotation}
            min={-360}
            max={360}
            suffix="°"
            onFocus={begin}
            onChange={(value) => live({ rotation: value })}
          />
          {(node.type === "rect" || node.type === "frame" || node.type === "image") && (
            <NumberField
              icon="◜"
              value={node.radius}
              min={0}
              max={999}
              onFocus={begin}
              onChange={(value) => live({ radius: value })}
            />
          )}
        </div>
        {isGroup && (
          <p className="mt-2 text-[10px] text-muted-foreground">Group bounds are computed from their children. Resize individual layers instead.</p>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className={cn("rounded px-1.5 py-0.5", !node.clip && "bg-secondary")}>{node.type}</span>
          {isFrame && (
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <Switch checked={node.clip} onCheckedChange={(checked) => apply({ clip: checked })} />
              {t("Clip content")}
            </label>
          )}
        </div>
      </Section>

      {selected.length >= 2 && <PathfinderSection readOnly={readOnly} />}
      {isFrame && <AutoLayoutSection node={node} onChange={(patch) => apply(patch)} readOnly={readOnly} />}
      {!isFrame && <ConstraintsSection page={page} node={node} onChange={(patch) => apply(patch)} />}
      <VectorSection node={node} readOnly={readOnly} />
      <ImageTraceSection node={node} readOnly={readOnly} />

      <AppearanceSection
        opacity={node.opacity}
        blur={node.blur}
        onLive={(opacity) => live({ opacity })}
        onBlur={(blur) => live({ blur })}
        onBegin={begin}
        readOnly={readOnly}
      />

      <FillSection paint={node.fill} onChange={(paint) => apply({ fill: paint })} readOnly={readOnly} title={node.type === "text" ? t("Text color") : t("Fill")} />

      <StrokeSection paint={node.stroke} width={node.strokeWidth} onChange={(patch) => apply(patch)} readOnly={readOnly} />

      <EffectsSection node={node} onChange={(patch) => apply(patch)} readOnly={readOnly} />

      {node.type === "text" && <TypographySection node={node} onLive={live} onBegin={begin} />}

      {node.type === "image" && <ImageSection node={node} onChange={(patch) => apply(patch)} />}

      <ExportSection page={page} selected={selected} />
    </div>
  );
}

function AutoLayoutSection({
  node,
  onChange,
  readOnly,
}: {
  node: SceneNode;
  onChange: (patch: Partial<SceneNode>) => void;
  readOnly: boolean;
}) {
  const t = useT();
  const direction = node.layout ?? "none";
  return (
    <Section title={t("Auto layout")}>
      <div className="space-y-2">
        <Segmented
          value={direction}
          options={[
            { value: "none", label: t("Free"), title: t("Free position") },
            { value: "horizontal", label: <Rows3 className="mx-auto size-3.5" />, title: t("Horizontal") },
            { value: "vertical", label: <Columns3 className="mx-auto size-3.5" />, title: t("Vertical") },
          ]}
          onChange={(layout) => onChange({
            layout,
            ...(layout === "none" ? {} : { layoutHugHeight: direction === "none" ? layout === "vertical" : node.layoutHugHeight }),
          })}
        />
        {direction !== "none" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <NumberField icon="↔" value={node.gap ?? 0} min={0} max={400} onFocus={() => undefined} onChange={(gap) => onChange({ gap })} />
              <NumberField icon="▣" value={node.padding ?? 0} min={0} max={400} onFocus={() => undefined} onChange={(padding) => onChange({ padding })} />
            </div>
            <Segmented
              value={node.layoutAlign ?? "start"}
              options={[
                { value: "start", label: t("Start") },
                { value: "center", label: t("Center") },
                { value: "end", label: t("End") },
                { value: "stretch", label: t("Stretch") },
              ]}
              onChange={(layoutAlign) => onChange({ layoutAlign })}
            />
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <label className="flex items-center gap-1.5">
                <Switch checked={!!node.layoutHugWidth} onCheckedChange={(layoutHugWidth) => onChange({ layoutHugWidth })} />
                {t("Hug width")}
              </label>
              <label className="flex items-center gap-1.5">
                <Switch checked={!!node.layoutHugHeight} onCheckedChange={(layoutHugHeight) => onChange({ layoutHugHeight })} />
                {t("Hug height")}
              </label>
            </div>
            {!readOnly && (
              <Button variant="ghost" size="sm" className="h-7 w-full text-[11px]" onClick={() => onChange({ layout: "none", layoutHugWidth: false, layoutHugHeight: false })}>
                {t("Remove auto layout")}
              </Button>
            )}
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {t("Arrange children automatically with padding, gap and alignment.")}
          </p>
        )}
      </div>
    </Section>
  );
}

function ConstraintsSection({
  page,
  node,
  onChange,
}: {
  page: Page;
  node: SceneNode;
  onChange: (patch: Partial<SceneNode>) => void;
}) {
  const t = useT();
  const parent = node.parentId ? page.nodes[node.parentId] : null;
  if (!parent || parent.type !== "frame") return null;
  const inAutoLayout = parent.layout === "horizontal" || parent.layout === "vertical";
  return (
    <Section title={t("Constraints")}>
      {inAutoLayout && (
        <label className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{t("Absolute position in auto layout")}</span>
          <Switch
            checked={node.layoutPositioning === "absolute"}
            onCheckedChange={(absolute) => onChange({ layoutPositioning: absolute ? "absolute" : "auto" })}
          />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Select value={node.constraintH ?? "left"} onValueChange={(v) => onChange({ constraintH: v as SceneNode["constraintH"] })}>
          <SelectTrigger className="h-8"><MoveHorizontal className="size-3.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="left">{t("Left")}</SelectItem>
            <SelectItem value="right">{t("Right")}</SelectItem>
            <SelectItem value="left-right">{t("Left & right")}</SelectItem>
            <SelectItem value="center">{t("Center")}</SelectItem>
            <SelectItem value="scale">{t("Scale")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={node.constraintV ?? "top"} onValueChange={(v) => onChange({ constraintV: v as SceneNode["constraintV"] })}>
          <SelectTrigger className="h-8"><MoveVertical className="size-3.5 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="top">{t("Top")}</SelectItem>
            <SelectItem value="bottom">{t("Bottom")}</SelectItem>
            <SelectItem value="top-bottom">{t("Top & bottom")}</SelectItem>
            <SelectItem value="center">{t("Center")}</SelectItem>
            <SelectItem value="scale">{t("Scale")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {inAutoLayout && node.layoutPositioning !== "absolute"
          ? t("Position follows the auto layout. Constraints can still scale the layer when its frame resizes.")
          : t("How this layer responds when its frame is resized.")}
      </p>
    </Section>
  );
}

function AlignSection({
  count,
  onAlign,
  onDistribute,
}: {
  count: number;
  onAlign: (kind: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => void;
  onDistribute: (axis: "h" | "v") => void;
}) {
  const t = useT();
  const buttons = [
    { icon: <AlignStartVertical className="size-4" />, title: "Align left", action: () => onAlign("left"), disabled: count < 1 },
    { icon: <AlignCenterVertical className="size-4" />, title: "Align horizontal centers", action: () => onAlign("hcenter"), disabled: count < 1 },
    { icon: <AlignEndVertical className="size-4" />, title: "Align right", action: () => onAlign("right"), disabled: count < 1 },
    { icon: <AlignStartHorizontal className="size-4" />, title: "Align top", action: () => onAlign("top"), disabled: count < 1 },
    { icon: <AlignCenterHorizontal className="size-4" />, title: "Align vertical centers", action: () => onAlign("vcenter"), disabled: count < 1 },
    { icon: <AlignEndHorizontal className="size-4" />, title: "Align bottom", action: () => onAlign("bottom"), disabled: count < 1 },
  ];
  return (
    <div className="flex items-center justify-between border-b border-panel-border px-3 py-2">
      <div className="flex items-center gap-0.5">
        {buttons.map((b) => (
          <button
            key={b.title}
            title={t(b.title)}
            disabled={b.disabled}
            onClick={b.action}
            className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            {b.icon}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          title={t("Distribute horizontal spacing")}
          disabled={count < 3}
          onClick={() => onDistribute("h")}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
        >
          <AlignHorizontalSpaceAround className="size-4" />
        </button>
        <button
          title={t("Distribute vertical spacing")}
          disabled={count < 3}
          onClick={() => onDistribute("v")}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
        >
          <AlignVerticalSpaceAround className="size-4" />
        </button>
      </div>
    </div>
  );
}

function SelectionBounds({ page, ids }: { page: Page; ids: string[] }) {
  const nodes = ids.map((id) => page.nodes[id]).filter(Boolean);
  if (nodes.length === 0) return null;
  const b = nodeAABB(page, nodes[0]);
  const minX = Math.min(...nodes.map((n) => nodeAABB(page, n).x));
  const minY = Math.min(...nodes.map((n) => nodeAABB(page, n).y));
  const maxX = Math.max(...nodes.map((n) => nodeAABB(page, n).x + nodeAABB(page, n).width));
  const maxY = Math.max(...nodes.map((n) => nodeAABB(page, n).y + nodeAABB(page, n).height));
  void b;
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField icon="X" value={round(minX, 1)} disabled onChange={() => undefined} />
      <NumberField icon="Y" value={round(minY, 1)} disabled onChange={() => undefined} />
      <NumberField icon="W" value={round(maxX - minX, 1)} disabled onChange={() => undefined} />
      <NumberField icon="H" value={round(maxY - minY, 1)} disabled onChange={() => undefined} />
    </div>
  );
}

function PathfinderSection({ readOnly }: { readOnly: boolean }) {
  const t = useT();
  const run = useEditor((s) => s.pathfinder);
  const items: { kind: "union" | "subtract" | "intersect" | "exclude"; label: string }[] = [
    { kind: "union", label: t("Union") },
    { kind: "subtract", label: t("Subtract") },
    { kind: "intersect", label: t("Intersect") },
    { kind: "exclude", label: t("Exclude") },
  ];
  return (
    <Section title={t("Pathfinder")}>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => (
          <Button
            key={item.kind}
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[10px]"
            disabled={readOnly}
            onClick={() => run(item.kind)}
          >
            <Combine className="size-3" /> {item.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {t("Uses the bottom layer as the base. Curves are preserved when possible.")}
      </p>
    </Section>
  );
}

function ImageTraceSection({ node, readOnly }: { node: SceneNode; readOnly: boolean }) {
  const t = useT();
  const trace = useEditor((s) => s.traceSelectedImage);
  const [busy, setBusy] = useState(false);
  if (node.type !== "image" || !node.src) return null;
  return (
    <Section title={t("Image trace")}>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-[11px]"
        disabled={readOnly || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const ok = await trace();
            if (ok) toast.success(t("Image traced to vector"));
            else toast.error(t("Could not trace this image"));
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}
        {t("Trace to vector")}
      </Button>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {t("Uses local color tracing. Works best on logos, icons and flat illustrations.")}
      </p>
    </Section>
  );
}

function VectorSection({ node, readOnly }: { node: SceneNode; readOnly: boolean }) {
  const t = useT();
  const updateNode = useEditor((s) => s.updateNode);
  const pushHistory = useEditor((s) => s.pushHistory);
  const selectedPoint = useEditor((s) => s.selectedPoint);
  const setSelectedPoint = useEditor((s) => s.setSelectedPoint);
  const split = useEditor((s) => s.splitCompound);
  const simplify = useEditor((s) => s.simplifySelectedVector);
  const offset = useEditor((s) => s.offsetSelectedVector);
  const outline = useEditor((s) => s.outlineSelectedStroke);
  const [offsetBy, setOffsetBy] = useState(4);
  const isVector = node.type === "vector";
  const canConvert = canConvertToVector(node);
  if (!isVector && !canConvert) return null;
  const subpaths = vectorSubpaths(node);
  const points = subpaths.flatMap((sub) => sub.points);
  const selectedLocation = selectedPoint != null ? allVectorPoints(node)[selectedPoint] : null;
  const hasPoint = !!selectedLocation;

  const updateSubpath = (pathIndex: number, next: typeof subpaths) => {
    if (readOnly) return;
    pushHistory();
    const updated = subpaths.map((sub, i) => (i === pathIndex ? { ...sub, points: next[pathIndex].points } : sub));
    updateNode(node.id, subpathPatch(updated), false);
  };

  return (
    <Section title={t("Vector")}>
      {!isVector && canConvert ? (
        <>
          <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
            {t("Convert this shape into an editable vector path.")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={readOnly}
            onClick={() => {
              const converted = shapeToVector(node);
              pushHistory();
              updateNode(node.id, {
                type: "vector",
                points: converted.points,
                closed: converted.closed,
                radius: 0,
                height: node.type === "line" ? Math.max(node.height, 1) : node.height,
              }, false);
              setSelectedPoint(null);
            }}
          >
            <PenTool className="size-3.5" /> {t("Convert to vector")}
          </Button>
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t("{count} points", { count: points.length })}</span>
            <span>{subpaths.length > 1 ? t("{count} subpaths", { count: subpaths.length }) : node.closed ? t("Closed path") : t("Open path")}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[10px]"
              disabled={readOnly}
              onClick={() => {
                const nextClosed = !node.closed;
                pushHistory();
                updateNode(node.id, {
                  ...subpathPatch(subpaths.map((sub) => ({ ...sub, closed: nextClosed }))),
                  closed: nextClosed,
                  fill: nextClosed ? node.fill ?? { type: "solid", color: "#0ea5e9" } : null,
                  // Closing a path turns it into a filled shape. Do not keep the
                  // pen preview stroke, otherwise it looks like an unwanted border.
                  stroke: nextClosed ? null : node.stroke ?? { type: "solid", color: "#0ea5e9" },
                }, false);
              }}
            >
              <Spline className="size-3.5" /> {node.closed ? t("Open path") : t("Close path")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[10px]"
              disabled={readOnly || !hasPoint}
              onClick={() => {
                if (!selectedLocation) return;
                const sub = subpaths[selectedLocation.path];
                const p = sub.points[selectedLocation.index];
                const smooth = !(p.in || p.out);
                const nextPoints = smooth
                  ? smoothPoint(sub.points, selectedLocation.index, sub.closed)
                  : cornerPoint(sub.points, selectedLocation.index);
                const next = subpaths.map((s, i) => (i === selectedLocation.path ? { ...s, points: nextPoints } : s));
                updateSubpath(selectedLocation.path, next);
              }}
            >
              {selectedLocation && (selectedLocation.point.in || selectedLocation.point.out) ? (
                <><CornerDownRight className="size-3.5" /> {t("Make corner")}</>
              ) : (
                <><Spline className="size-3.5" /> {t("Smooth point")}</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[10px] text-destructive"
              disabled={readOnly || !hasPoint || (selectedLocation ? subpaths[selectedLocation.path].points.length <= 2 : true)}
              onClick={() => {
                if (!selectedLocation) return;
                const sub = subpaths[selectedLocation.path];
                if (sub.points.length <= 2) return;
                const next = subpaths.map((s, i) => (i === selectedLocation.path ? { ...s, points: removePoint(s.points, selectedLocation.index) } : s));
                updateSubpath(selectedLocation.path, next);
                setSelectedPoint(null);
              }}
            >
              <Trash2 className="size-3.5" /> {t("Delete point")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[10px]"
              disabled={selectedPoint == null}
              onClick={() => setSelectedPoint(null)}
            >
              <CornerDownRight className="size-3.5" /> {t("Deselect point")}
            </Button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" className="gap-1 text-[10px]" disabled={readOnly || (node.subpaths?.length ?? 0) <= 1} onClick={() => split()}>
              <Split className="size-3" /> {t("Split paths")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-[10px]" disabled={readOnly} onClick={() => simplify()}>
              <WandSparkles className="size-3" /> {t("Simplify")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-[10px]" disabled={readOnly} onClick={() => offset(offsetBy)}>
              <ArrowUpFromLine className="size-3" /> {t("Offset +")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-[10px]" disabled={readOnly} onClick={() => offset(-offsetBy)}>
              <ArrowUpFromLine className="size-3 rotate-180" /> {t("Offset −")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-[10px]" disabled={readOnly || !node.stroke} onClick={() => outline()}>
              <PenTool className="size-3" /> {t("Outline stroke")}
            </Button>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{t("Offset")}</span>
              <NumberField value={offsetBy} min={1} max={64} onChange={setOffsetBy} className="h-7 min-w-0 flex-1" />
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">{t("Fill rule")}</span>
            <button
              type="button"
              className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-secondary"
              disabled={readOnly}
              onClick={() => { pushHistory(); updateNode(node.id, { fillRule: node.fillRule === "evenodd" ? "nonzero" : "evenodd" }, false); }}
            >
              {node.fillRule === "evenodd" ? "evenodd" : "nonzero"}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {t("Double-click the path to add a point. Drag anchors or handles; Alt-click deletes an anchor.")}
          </p>
        </>
      )}
    </Section>
  );
}

function AppearanceSection({
  opacity,
  blur,
  onLive,
  onBlur,
  onBegin,
  readOnly,
}: {
  opacity: number;
  blur?: number;
  onLive: (opacity: number) => void;
  onBlur?: (blur: number) => void;
  onBegin: () => void;
  readOnly: boolean;
}) {
  const t = useT();
  return (
    <Section title={t("Appearance")}>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{t("Opacity")}</span>
        <div className="flex flex-1 items-center gap-2" onPointerDown={onBegin}>
          <Slider
            value={[Math.round(opacity * 100)]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => onLive(clamp(v[0] / 100, 0, 1))}
          />
        </div>
        <div className="w-16">
          <NumberField
            value={Math.round(opacity * 100)}
            min={0}
            max={100}
            suffix="%"
            disabled={readOnly}
            onFocus={onBegin}
            onChange={(v) => onLive(clamp(v / 100, 0, 1))}
          />
        </div>
      </div>
      {onBlur && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{t("Blur")}</span>
          <NumberField value={blur ?? 0} min={0} max={100} onFocus={onBegin} onChange={(v) => onBlur(v)} className="flex-1" />
        </div>
      )}
    </Section>
  );
}

function FillSection({ paint, onChange, readOnly, title = "Fill" }: { paint: Paint | null; onChange: (paint: Paint | null) => void; readOnly: boolean; title?: string }) {
  const t = useT();
  const begin = useEditor((s) => s.pushHistory);
  return (
    <Section
      title={title}
      action={
        <div className="flex items-center gap-0.5">
          {!paint && (
            <button
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
              onClick={() => onChange({ type: "solid", color: "#0ea5e9" })}
            >
              <Plus className="size-3.5" />
            </button>
          )}
          {paint && (
            <button
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      }
    >
      {!paint ? (
        <SectionEmpty>{t("No fill")}</SectionEmpty>
      ) : paint.type === "solid" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ColorSwatch color={paint.color} onFocus={begin} onChange={(color) => onChange({ ...paint, color })} />
            <HexInput value={paint.color} onFocus={begin} onChange={(color) => onChange({ ...paint, color })} />
            <div className="w-16">
              <NumberField
                value={Math.round((paint.opacity ?? 1) * 100)}
                min={0}
                max={100}
                suffix="%"
                onFocus={begin}
                onChange={(v) => onChange({ ...paint, opacity: clamp(v / 100, 0, 1) })}
              />
            </div>
          </div>
          <PaintTypeRow
            value="solid"
            onChange={(type) => {
              if (type === "linear") {
                const g = defaultGradient() as Extract<Paint, { type: "linear" }>;
                g.stops[0].color = paint.color;
                onChange(g);
              }
            }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <PaintTypeRow
            value="linear"
            onChange={(type) => {
              if (type === "solid") onChange({ type: "solid", color: paint.stops[0]?.color ?? "#0ea5e9" });
            }}
          />
          <div className="flex items-center gap-2">
            <span className="w-10 text-[11px] text-muted-foreground">Angle</span>
            <NumberField value={paint.angle} min={-360} max={360} suffix="°" onFocus={begin} onChange={(angle) => onChange({ ...paint, angle })} />
            <div
              className="size-7 rounded-md border border-border"
              style={{ background: `linear-gradient(${paint.angle}deg, ${paint.stops.map((s) => s.color).join(",")})` }}
            />
          </div>
          {paint.stops.map((stop, index) => (
            <div key={index} className="flex items-center gap-2">
              <ColorSwatch
                color={stop.color}
                onFocus={begin}
                onChange={(color) => {
                  const stops = paint.stops.map((s, i) => (i === index ? { ...s, color } : s));
                  onChange({ ...paint, stops });
                }}
              />
              <HexInput
                value={stop.color}
                onFocus={begin}
                onChange={(color) => {
                  const stops = paint.stops.map((s, i) => (i === index ? { ...s, color } : s));
                  onChange({ ...paint, stops });
                }}
              />
              <div className="w-14">
                <NumberField
                  value={Math.round(stop.position * 100)}
                  min={0}
                  max={100}
                  suffix="%"
                  onFocus={begin}
                  onChange={(v) => {
                    const stops = paint.stops.map((s, i) => (i === index ? { ...s, position: clamp(v / 100, 0, 1) } : s));
                    onChange({ ...paint, stops });
                  }}
                />
              </div>
              {paint.stops.length > 2 && (
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onChange({ ...paint, stops: paint.stops.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            className="text-[11px] text-primary hover:underline"
            onClick={() =>
              onChange({
                ...paint,
                stops: [
                  ...paint.stops,
                  { color: "#ffffff", position: clamp((paint.stops[paint.stops.length - 1]?.position ?? 0.5) - 0.2, 0, 1) },
                ],
              })
            }
          >
            + Add stop
          </button>
        </div>
      )}
      {readOnly && <div className="sr-only">Read only</div>}
    </Section>
  );
}

function PaintTypeRow({ value, onChange }: { value: "solid" | "linear"; onChange: (value: "solid" | "linear") => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[11px] text-muted-foreground">{t("Type")}</span>
      <Select value={value} onValueChange={(v) => onChange(v as "solid" | "linear")}>
        <SelectTrigger className="h-7 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="solid">{t("Solid")}</SelectItem>
          <SelectItem value="linear">{t("Linear gradient")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function StrokeSection({
  paint,
  width,
  onChange,
  readOnly,
}: {
  paint: Paint | null;
  width: number;
  onChange: (patch: Partial<SceneNode>) => void;
  readOnly: boolean;
}) {
  const t = useT();
  const begin = useEditor((s) => s.pushHistory);
  return (
    <Section
      title={t("Stroke")}
      action={
        <div className="flex items-center gap-0.5">
          {!paint && (
            <button
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
              onClick={() => onChange({ stroke: { type: "solid", color: "#111827" }, strokeWidth: 1 })}
            >
              <Plus className="size-3.5" />
            </button>
          )}
          {paint && (
            <button
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-destructive"
              onClick={() => onChange({ stroke: null })}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      }
    >
      {!paint ? (
        <SectionEmpty>{t("No stroke")}</SectionEmpty>
      ) : (
        <div className="flex items-center gap-2">
          <ColorSwatch
            color={paint.type === "solid" ? paint.color : paint.stops[0]?.color ?? "#111827"}
            onFocus={begin}
            onChange={(color) => onChange({ stroke: paint.type === "solid" ? { ...paint, color } : paint })}
          />
          <HexInput
            value={paint.type === "solid" ? paint.color : paint.stops[0]?.color ?? "#111827"}
            onFocus={begin}
            onChange={(color) => onChange({ stroke: { type: "solid", color } })}
          />
          <div className="w-16">
            <NumberField value={width} min={0} max={100} step={0.5} onFocus={begin} onChange={(v) => onChange({ strokeWidth: v })} />
          </div>
        </div>
      )}
      {readOnly && <span className="hidden" />}
    </Section>
  );
}

function EffectsSection({ node, onChange, readOnly }: { node: SceneNode; onChange: (patch: Partial<SceneNode>) => void; readOnly: boolean }) {
  const t = useT();
  const begin = useEditor((s) => s.pushHistory);
  const shadow = node.shadow;
  return (
    <Section
      title={t("Effects")}
      action={
        !shadow ? (
          <button
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary"
            onClick={() => onChange({ shadow: { x: 0, y: 8, blur: 24, spread: -4, color: "rgba(15, 23, 42, 0.22)" } })}
          >
            <Plus className="size-3.5" />
          </button>
        ) : (
          <button
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-destructive"
            onClick={() => onChange({ shadow: null })}
          >
            <Trash2 className="size-3.5" />
          </button>
        )
      }
    >
      {!shadow ? (
        <SectionEmpty>{t("No effects")}</SectionEmpty>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            <NumberField icon="X" value={shadow.x} onFocus={begin} onChange={(v) => onChange({ shadow: { ...shadow, x: v } })} />
            <NumberField icon="Y" value={shadow.y} onFocus={begin} onChange={(v) => onChange({ shadow: { ...shadow, y: v } })} />
            <NumberField icon="B" value={shadow.blur} min={0} onFocus={begin} onChange={(v) => onChange({ shadow: { ...shadow, blur: v } })} />
            <NumberField icon="S" value={shadow.spread} onFocus={begin} onChange={(v) => onChange({ shadow: { ...shadow, spread: v } })} />
          </div>
          <div className="flex items-center gap-2">
            <ColorSwatch
              color={shadow.color.startsWith("#") ? shadow.color : "#0f172a"}
              onFocus={begin}
              onChange={(color) => onChange({ shadow: { ...shadow, color } })}
            />
            <InlineInput value={shadow.color} onChange={(color) => onChange({ shadow: { ...shadow, color } })} />
          </div>
        </div>
      )}
      {readOnly && <span className="hidden" />}
    </Section>
  );
}

function TypographySection({
  node,
  onLive,
  onBegin,
}: {
  node: SceneNode;
  onLive: (patch: Partial<SceneNode>) => void;
  onBegin: () => void;
}) {
  const t = useT();
  const setLive = (patch: Partial<SceneNode>) => {
    onBegin();
    onLive(patch);
  };
  return (
    <Section title={t("Typography")}>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select value={node.fontFamily} onValueChange={(v) => setLive({ fontFamily: v })}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="w-24">
            <Select value={String(node.fontWeight)} onValueChange={(v) => setLive({ fontWeight: Number(v) })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_WEIGHTS.map((w) => (
                  <SelectItem key={w.value} value={String(w.value)}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <NumberField icon="A" value={node.fontSize} min={1} max={400} onFocus={onBegin} onChange={(v) => onLive({ fontSize: v })} />
          <NumberField icon="↕" value={node.lineHeight} min={0.5} max={5} step={0.1} onFocus={onBegin} onChange={(v) => onLive({ lineHeight: v })} />
          <NumberField icon="↔" value={node.letterSpacing} min={-20} max={100} step={0.1} onFocus={onBegin} onChange={(v) => onLive({ letterSpacing: v })} />
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            className="flex-1"
            value={node.textAlign}
            onChange={(v) => setLive({ textAlign: v })}
            options={[
              { value: "left", label: <AlignLeft className="size-3.5" />, title: "Align left" },
              { value: "center", label: <AlignCenter className="size-3.5" />, title: "Align center" },
              { value: "right", label: <AlignRight className="size-3.5" />, title: "Align right" },
            ]}
          />
          <Segmented
            className="flex-1"
            value={node.verticalAlign}
            onChange={(v) => setLive({ verticalAlign: v })}
            options={[
              { value: "top", label: <ArrowUpToLine className="size-3.5" />, title: "Align top" },
              { value: "middle", label: <AlignCenterVertical className="size-3.5" />, title: "Align middle" },
              { value: "bottom", label: <ArrowDownToLine className="size-3.5" />, title: "Align bottom" },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}

function ImageSection({ node, onChange }: { node: SceneNode; onChange: (patch: Partial<SceneNode>) => void }) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Section title={t("Image")}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-14 text-[11px] text-muted-foreground">{t("Fit")}</span>
          <Select value={node.objectFit} onValueChange={(v) => onChange({ objectFit: v as SceneNode["objectFit"] })}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">{t("Cover")}</SelectItem>
              <SelectItem value="contain">{t("Contain")}</SelectItem>
              <SelectItem value="fill">{t("Fill")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => inputRef.current?.click()}>
          <ImageIcon className="size-3.5" /> {t("Replace image")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
              toast.error(t("Image must be smaller than 10 MB"));
              return;
            }
            try {
              const src = await uploadImage(file);
              onChange({ src });
            } catch (err) {
              toast.error((err as Error).message || "Could not upload image");
            }
          }}
        />
      </div>
    </Section>
  );
}

function PageInfo({ page }: { page: Page }) {
  const t = useT();
  const file = useEditor((s) => s.file);
  const setPageName = useEditor((s) => s.setPageName);
  const [name, setName] = useState(page.name);
  useEffect(() => setName(page.name), [page.name]);
  const commit = () => {
    if (name.trim() && name.trim() !== page.name) setPageName(page.id, name.trim());
  };
  return (
    <>
      <Section title={t("Page")}>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-14 text-[11px] text-muted-foreground">{t("Name")}</span>
            <InlineInput value={name} onChange={setName} onFocus={() => undefined} />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={commit}>
            {t("Rename page")}
          </Button>
        </div>
      </Section>
      <Section title={t("Document")}>
        <div className="space-y-1.5 text-[11px] text-muted-foreground">
          <div className="flex justify-between">
            <span>{t("File")}</span>
            <span className="max-w-[140px] truncate text-foreground">{file?.name}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("Pages")}</span>
            <span className="text-foreground">{useEditor.getState().doc.pages.length}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("Layers on this page")}</span>
            <span className="text-foreground">{Object.keys(page.nodes).length}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("Owner")}</span>
            <span className="text-foreground">{file?.ownerName}</span>
          </div>
        </div>
      </Section>
      <Section title={t("Tips")}>
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <li>{t("Press F and drag to create a frame.")}</li>
          <li>{t("Hold Space to pan, ⌘/Ctrl + scroll to zoom.")}</li>
          <li>{t("Select layers and press ⌘G to group.")}</li>
          <li>{t("Add a link in the Prototype tab, then hit Play.")}</li>
        </ul>
      </Section>
    </>
  );
}

function ExportSection({ page, selected }: { page: Page; selected: SceneNode[] }) {
  const t = useT();
  const [scale, setScale] = useState("2");
  const [busy, setBusy] = useState(false);
  const first = selected[0];
  if (!first) return null;

  const exportNode = async (format: "png" | "svg") => {
    const el = document.querySelector(`[data-node-id="${first.id}"]`) as HTMLElement | null;
    if (!el) {
      toast.error("Could not find the layer on canvas");
      return;
    }
    setBusy(true);
    try {
      const ratio = Number(scale) || 1;
      const options = {
        pixelRatio: ratio,
        width: Math.max(first.width, 1),
        height: Math.max(Math.abs(first.height), 1),
        style: {
          position: "relative",
          left: "0px",
          top: "0px",
          margin: "0",
          transform: first.rotation ? `rotate(${first.rotation}deg)` : "none",
          transformOrigin: "center center",
        },
      };
      const { toPng, toSvg } = await import("html-to-image");
      const dataUrl = format === "png" ? await toPng(el, options) : await toSvg(el, options);
      downloadDataUrl(dataUrl, `${safeName(first.name)}.${format}`);
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  const copyPng = async () => {
    const el = document.querySelector(`[data-node-id="${first.id}"]`) as HTMLElement | null;
    if (!el) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, {
        pixelRatio: Number(scale) || 1,
        width: Math.max(first.width, 1),
        height: Math.max(Math.abs(first.height), 1),
        style: { position: "relative", left: "0px", top: "0px", margin: "0", transform: first.rotation ? `rotate(${first.rotation}deg)` : "none" },
      });
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Copied as PNG");
    } catch (err) {
      console.error(err);
      toast.error("Clipboard image is not supported in this browser");
    }
  };

  return (
    <Section title={t("Export")}>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select value={scale} onValueChange={setScale}>
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
              <SelectItem value="3">3x</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="flex-1" disabled={busy} onClick={() => exportNode("png")}>
            <Download className="size-3.5" /> PNG
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => exportNode("svg")}>
            SVG
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="w-full" onClick={copyPng}>
          <Copy className="size-3.5" /> {t("Copy as PNG")}
        </Button>
        <p className="text-[10px] text-muted-foreground">
          {Math.round(first.width * (Number(scale) || 1))} × {Math.round(Math.abs(first.height) * (Number(scale) || 1))} px
        </p>
      </div>
      <span className="hidden">{page.id}</span>
    </Section>
  );
}

function PrototypeTab({ page, single, readOnly, doc }: { page: Page; single: SceneNode | null; readOnly: boolean; doc: SigmaDoc }) {
  const t = useT();
  const updateNode = useEditor((s) => s.updateNode);
  const openPreview = useEditor((s) => s.openPreview);
  if (!single) {
    return (
      <>
        <Section title={t("Prototype")}>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Select a layer to connect it to another frame. Linked layers become clickable hotspots in presentation mode.
          </p>
          <Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => openPreview(null)}>
            <MousePointerClick className="size-3.5" /> {t("Present current page")}
          </Button>
        </Section>
        <Section title={t("Interactions")}>
          <HotspotList page={page} doc={doc} />
        </Section>
      </>
    );
  }
  const link = single.link;
  const allFrames = doc.pages.flatMap((p) =>
    p.rootIds
      .map((id) => p.nodes[id])
      .filter((n): n is SceneNode => !!n && n.type === "frame")
      .map((n) => ({ page: p, frame: n })),
  );
  const targetValue = link?.targetPageId && link?.targetFrameId ? `${link.targetPageId}|${link.targetFrameId}` : undefined;

  const updateLink = (patch: Partial<NonNullable<SceneNode["link"]>>) => {
    const base = link ?? { action: "navigate" as const, transition: "instant" as const };
    updateNode(single.id, { link: { ...base, ...patch } });
  };

  return (
    <div className={cn(readOnly && "pointer-events-none opacity-60")}>
      <Section title={t("Interaction")}>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-16 text-[11px] text-muted-foreground">{t("On click")}</span>
            <Select
              value={link?.action ?? "none"}
              onValueChange={(value) => {
                if (value === "none") updateNode(single.id, { link: null });
                else updateLink({ action: value as "navigate" | "back" | "url" });
              }}
            >
              <SelectTrigger className="h-8 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("No interaction")}</SelectItem>
                <SelectItem value="navigate">{t("Navigate to frame")}</SelectItem>
                <SelectItem value="back">{t("Back")}</SelectItem>
                <SelectItem value="url">{t("Open URL")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {link?.action === "navigate" && (
            <div className="flex items-center gap-2">
              <span className="w-16 text-[11px] text-muted-foreground">{t("Target")}</span>
              <Select
                value={targetValue}
                onValueChange={(value) => {
                  const [targetPageId, targetFrameId] = value.split("|");
                  updateLink({ targetPageId, targetFrameId });
                }}
              >
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder={t("Choose frame…")} />
                </SelectTrigger>
                <SelectContent>
                  {allFrames.map(({ page: p, frame }) => (
                    <SelectItem key={`${p.id}|${frame.id}`} value={`${p.id}|${frame.id}`}>
                      {p.name} / {frame.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {link?.action === "url" && (
            <div className="flex items-center gap-2">
              <span className="w-16 text-[11px] text-muted-foreground">URL</span>
              <InlineInput
                value={link.url ?? ""}
                onChange={(url) => updateLink({ url })}
                placeholder="https://example.com"
              />
            </div>
          )}

          {link && link.action !== "none" && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-muted-foreground">{t("Animation")}</span>
                <Select
                  value={link.transition ?? "instant"}
                  onValueChange={(v) => updateLink({ transition: v as Transition })}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">{t("Instant")}</SelectItem>
                    <SelectItem value="dissolve">{t("Dissolve")}</SelectItem>
                    <SelectItem value="slide-left">{t("Slide left")}</SelectItem>
                    <SelectItem value="slide-up">{t("Slide up")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => openPreview(single.type === "frame" ? single.id : null)}>
                  <MousePointerClick className="size-3.5" /> {t("Present")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => updateNode(single.id, { link: null })}>
                  <RotateCcw className="size-3.5" /> {t("Clear")}
                </Button>
              </div>
            </>
          )}
          {!link && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Tip: link a button layer to another frame to build a click-through flow.
            </p>
          )}
        </div>
      </Section>

      {single.type === "frame" && (
        <Section title={t("Flow")}>
          <div className="space-y-2">
            <Button size="sm" className="w-full" onClick={() => openPreview(single.id)}>
              <MousePointerClick className="size-3.5" /> {t("Start prototype from this frame")}
            </Button>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t("Hotspots in frame")}</span>
              <span className="text-foreground">{countHotspots(page, single.id)}</span>
            </div>
          </div>
        </Section>
      )}

      <Section title={t("Links")}>
        <div className="space-y-1.5">
          {page.nodes[single.id]?.link ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[11px]">
              <Link2 className="size-3.5 text-primary" />
              <span className="truncate">
                {single.link?.action === "navigate"
                  ? `→ ${frameName(doc, single.link.targetPageId, single.link.targetFrameId)}`
                  : single.link?.action === "url"
                    ? single.link.url
                    : "Back"}
              </span>
              <ExternalLink className="ml-auto size-3 text-muted-foreground" />
            </div>
          ) : (
            <SectionEmpty>{t("No outgoing link")}</SectionEmpty>
          )}
        </div>
      </Section>
    </div>
  );
}

function HotspotList({ page, doc }: { page: Page; doc: SigmaDoc }) {
  const hotspots = Object.values(page.nodes).filter((n) => n.link && n.link.action !== "none");
  if (hotspots.length === 0) return <SectionEmpty>No interactions on this page</SectionEmpty>;
  return (
    <div className="space-y-1.5">
      {hotspots.map((n) => (
        <div key={n.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[11px]">
          <Link2 className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{n.name}</span>
          <span className="ml-auto truncate text-muted-foreground">
            {n.link?.action === "navigate"
              ? frameName(doc, n.link.targetPageId, n.link.targetFrameId)
              : n.link?.action === "url"
                ? "URL"
                : "Back"}
          </span>
        </div>
      ))}
    </div>
  );
}

function countHotspots(page: Page, frameId: string): number {
  let count = 0;
  const walk = (id: string) => {
    const node = page.nodes[id];
    if (!node) return;
    if (node.link && node.link.action !== "none") count++;
    for (const child of node.children) walk(child);
  };
  walk(frameId);
  return count;
}

function frameName(doc: SigmaDoc, pageId?: string, frameId?: string): string {
  if (!pageId || !frameId) return "Choose target";
  const page = getPage(doc, pageId);
  return page.nodes[frameId]?.name ?? "Missing frame";
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "layer";
}
