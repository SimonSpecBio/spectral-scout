"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { SEVERITY_COLOR, type Severity } from "@/lib/colors";

// "line" is part of the schema's shape vocabulary (for rows/benches drawn
// as a simple segment) but has no drawing tool yet -- only rendered if a
// row already exists, not creatable from this editor in v1.
type ShapeType = "rect" | "circle" | "polygon" | "line" | "label";

interface Geometry {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  rotation?: number;
  points?: number[];
}

interface MapObject {
  id: string;
  shapeType: ShapeType;
  geometry: Geometry;
  style: { fill?: string; stroke?: string; strokeWidth?: number } | null;
  label: string | null;
  zIndex: number;
}

interface Area {
  id: string;
  name: string;
  backgroundImageUrl: string | null;
  backgroundScale: number | null;
}


interface PestEvent {
  id: string;
  x: number | null;
  y: number | null;
  pestSpecies: string;
  severity: Severity;
  status: "active" | "resolved";
  notes: string | null;
  createdAt: string;
  lastTreatedAt: string | null;
  trend: "up" | "down" | "stable" | null;
}

const FOLLOW_UP_AFTER_DAYS = 3;
const RECENTLY_TREATED_DAYS = 7;
const DAY_MS = 86_400_000;
function needsFollowUp(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > FOLLOW_UP_AFTER_DAYS * DAY_MS;
}
function wasRecentlyTreated(lastTreatedAt: string | null): boolean {
  return lastTreatedAt != null && Date.now() - new Date(lastTreatedAt).getTime() < RECENTLY_TREATED_DAYS * DAY_MS;
}
// Bigger pin = worse severity -- one of the two always-on visual channels
// (color being the other), per the "glanceable, not click-to-learn" design
// direction. Ring/halo/arrow are secondary accents, only drawn when there's
// something to say, not competing dimensions on every pin.
const SEVERITY_RADIUS: Record<Severity, number> = { low: 7, moderate: 9.5, high: 12, severe: 15 };

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
// Konva renders to canvas, not DOM, so it can't read CSS custom properties
// -- these have to match --map-blue/--map-blue-soft in globals.css literally.
const MAP_BLUE = "#7ec4f0";
const MAP_BLUE_FILL = "#bfe3fa";
const SEVERITY_RANK: Record<Severity, number> = { low: 0, moderate: 1, high: 2, severe: 3 };

// Every drawn zone is the same calm light blue by default -- color is a
// hotspot signal, not a decoration a grower picks per-shape. If an active
// pest event's pin falls inside a zone, that zone tints to the worst
// severity found inside it instead.
function pointInShape(px: number, py: number, obj: Pick<MapObject, "shapeType" | "geometry">): boolean {
  const g = obj.geometry;
  if (obj.shapeType === "rect") {
    const x0 = Math.min(g.x ?? 0, (g.x ?? 0) + (g.width ?? 0));
    const x1 = Math.max(g.x ?? 0, (g.x ?? 0) + (g.width ?? 0));
    const y0 = Math.min(g.y ?? 0, (g.y ?? 0) + (g.height ?? 0));
    const y1 = Math.max(g.y ?? 0, (g.y ?? 0) + (g.height ?? 0));
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  }
  if (obj.shapeType === "circle") {
    const dx = px - (g.x ?? 0);
    const dy = py - (g.y ?? 0);
    return Math.sqrt(dx * dx + dy * dy) <= (g.radius ?? 0);
  }
  if (obj.shapeType === "polygon" && g.points) {
    let inside = false;
    const pts = g.points;
    for (let i = 0, j = pts.length / 2 - 1; i < pts.length / 2; j = i++) {
      const xi = pts[i * 2],
        yi = pts[i * 2 + 1];
      const xj = pts[j * 2],
        yj = pts[j * 2 + 1];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

function hotspotSeverity(obj: MapObject, events: PestEvent[]): Severity | null {
  let worst: Severity | null = null;
  for (const ev of events) {
    if (ev.status !== "active" || ev.x == null || ev.y == null) continue;
    if (!pointInShape(ev.x, ev.y, obj)) continue;
    if (!worst || SEVERITY_RANK[ev.severity] > SEVERITY_RANK[worst]) worst = ev.severity;
  }
  return worst;
}

function useBackgroundImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => setImage(img);
    // Runs on cleanup (dependency change or unmount), not synchronously in
    // the effect body -- clears the stale image while a new one loads, or
    // when url goes back to null.
    return () => setImage(null);
  }, [url]);
  return image;
}

export default function MapEditor({
  facilityId,
  area,
  initialObjects,
  initialPestEvents,
}: {
  facilityId: string;
  area: Area;
  initialObjects: MapObject[];
  initialPestEvents: PestEvent[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [objects, setObjects] = useState<MapObject[]>(initialObjects);
  const [pestEvents, setPestEvents] = useState<PestEvent[]>(initialPestEvents);
  const [tool, setTool] = useState<ShapeType | "select" | "pest">("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{ shapeType: ShapeType; geometry: Geometry } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pestFormPos, setPestFormPos] = useState<{ x: number; y: number } | null>(null);
  const [pestSpecies, setPestSpecies] = useState("");
  const [pestSeverity, setPestSeverity] = useState<Severity>("moderate");
  const [selectedEvent, setSelectedEvent] = useState<PestEvent | null>(null);

  const bgImage = useBackgroundImage(area.backgroundImageUrl);
  const transformerRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // The canvas's internal coordinate system stays a fixed 900x600 (every
  // shape's x/y/width/height is stored in that space) -- only how it's
  // *rendered* shrinks to fit narrower viewports, via Konva's own
  // scaleX/scaleY on the Stage. Without this, a 900px-wide canvas overflows
  // any container narrower than that and gets clipped on the right, which
  // is exactly the "square gets cut off as I move it right" bug: the shape
  // was never actually off-canvas, the canvas itself just didn't fit.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      // Capped at 1.4x, not 1x -- the map should fill most of its card on
      // a normal desktop width, not stay pinned to 900px with dead space
      // around it, but an ultrawide monitor shouldn't blow it up absurdly.
      setScale(Math.min(1.4, entry.contentRect.width / CANVAS_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const base = `/api/facilities/${facilityId}/areas/${area.id}`;
  const eventsBase = `/api/facilities/${facilityId}/pest-events`;

  useEffect(() => {
    if (!transformerRef.current) return;
    const node = selectedId ? shapeRefs.current.get(selectedId) : null;
    transformerRef.current.nodes(node ? [node] : []);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedId, objects]);

  async function createObject(shapeType: ShapeType, geometry: Geometry, label: string | null = null) {
    const res = await fetch(`${base}/objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shapeType, geometry, label }),
    });
    if (res.ok) {
      const row = await res.json();
      setObjects((prev) => [...prev, row]);
    }
  }

  async function updateGeometry(id: string, geometry: Geometry) {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, geometry } : o)));
    await fetch(`${base}/objects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry }),
    });
  }

  async function deleteSelected() {
    if (!selectedId) return;
    await fetch(`${base}/objects/${selectedId}`, { method: "DELETE" });
    setObjects((prev) => prev.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }

  async function submitPestEvent() {
    if (!pestFormPos || !pestSpecies.trim()) return;
    const res = await fetch(eventsBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facilityAreaId: area.id,
        x: pestFormPos.x,
        y: pestFormPos.y,
        pestSpecies: pestSpecies.trim(),
        severity: pestSeverity,
      }),
    });
    if (res.ok) {
      const row = await res.json();
      setPestEvents((prev) => [...prev, row]);
    }
    setPestFormPos(null);
    setPestSpecies("");
    setPestSeverity("moderate");
    setTool("select");
  }

  async function resolveSelectedEvent() {
    if (!selectedEvent) return;
    const res = await fetch(`${eventsBase}/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    if (res.ok) {
      setPestEvents((prev) => prev.map((ev) => (ev.id === selectedEvent.id ? { ...ev, status: "resolved" } : ev)));
    }
    setSelectedEvent(null);
  }

  async function deleteSelectedEvent() {
    if (!selectedEvent) return;
    await fetch(`${eventsBase}/${selectedEvent.id}`, { method: "DELETE" });
    setPestEvents((prev) => prev.filter((ev) => ev.id !== selectedEvent.id));
    setSelectedEvent(null);
  }

  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${base}/background`, { method: "POST", body: form });
    setUploading(false);
    if (res.ok) window.location.reload(); // simplest way to refresh the loaded background image
  }

  function stagePos(e: Konva.KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    // getPointerPosition() returns raw container pixels, not adjusted for
    // the stage's own scaleX/scaleY -- with the responsive scale added
    // above, that would land every drawn shape/dropped pin in the wrong
    // spot whenever scale != 1. getRelativePointerPosition() accounts for
    // the stage's full transform, giving back real 900x600-space
    // coordinates regardless of how small the stage is currently rendered.
    return stage?.getRelativePointerPosition() ?? { x: 0, y: 0 };
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (mode === "view") return; // view mode has no drawing/selection tools -- pins handle their own click
    if (tool === "select") {
      if (e.target === e.target.getStage()) {
        setSelectedId(null);
        setSelectedEvent(null);
      }
      return;
    }
    const pos = stagePos(e);
    if (tool === "pest") {
      setPestFormPos(pos);
      return;
    }
    if (tool === "rect") {
      setDrawing({ shapeType: "rect", geometry: { x: pos.x, y: pos.y, width: 0, height: 0 } });
    } else if (tool === "circle") {
      setDrawing({ shapeType: "circle", geometry: { x: pos.x, y: pos.y, radius: 0 } });
    } else if (tool === "label") {
      const text = window.prompt("Label text:");
      if (text) createObject("label", { x: pos.x, y: pos.y }, text);
      setTool("select");
    } else if (tool === "polygon") {
      setPolygonPoints((prev) => [...prev, pos.x, pos.y]);
    }
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!drawing) return;
    const pos = stagePos(e);
    if (drawing.shapeType === "rect") {
      setDrawing({
        ...drawing,
        geometry: { ...drawing.geometry, width: pos.x - drawing.geometry.x!, height: pos.y - drawing.geometry.y! },
      });
    } else if (drawing.shapeType === "circle") {
      const dx = pos.x - drawing.geometry.x!;
      const dy = pos.y - drawing.geometry.y!;
      setDrawing({ ...drawing, geometry: { ...drawing.geometry, radius: Math.sqrt(dx * dx + dy * dy) } });
    }
  }

  async function handleMouseUp() {
    if (!drawing) return;
    await createObject(drawing.shapeType, drawing.geometry);
    setDrawing(null);
    setTool("select");
  }

  function finishPolygon() {
    if (polygonPoints.length >= 6) createObject("polygon", { points: polygonPoints });
    setPolygonPoints([]);
    setTool("select");
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => {
            setMode((m) => (m === "view" ? "edit" : "view"));
            setSelectedId(null);
            setSelectedEvent(null);
            setTool("select");
          }}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            mode === "edit" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
          }`}
        >
          {mode === "edit" ? "Done editing" : "Edit site layout"}
        </button>
      </div>

      {mode === "edit" && (
        <div className="flex flex-wrap items-center gap-2">
          {(["select", "rect", "circle", "polygon", "label", "pest"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTool(t);
                setPolygonPoints([]);
                setPestFormPos(null);
              }}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                tool === t ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-dim)]"
              }`}
            >
              {t === "pest" ? "Pest event" : t}
            </button>
          ))}
          {tool === "polygon" && (
            <button onClick={finishPolygon} className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)]">
              Finish shape ({polygonPoints.length / 2} pts)
            </button>
          )}
          {selectedId && (
            <button onClick={deleteSelected} className="rounded-md border border-red-400 px-3 py-1.5 text-sm text-red-400">
              Delete selected
            </button>
          )}
          <label className="ml-auto cursor-pointer rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]">
            {uploading ? "Uploading…" : "Upload blueprint/background"}
            <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
          </label>
        </div>
      )}

      {/* Explicit pixel size, not "shrink to fit content" -- this div is a
          flex-column child, and flex's default align-items:stretch would
          otherwise stretch it to the full width of its parent (which can be
          wider than the Stage's actual rendered size), leaving the Stage
          -- and everything drawn on it -- pushed into the left portion of a
          too-wide bordered frame. That mismatch was the real cause of "zones
          crushed to the left," not a spacing bug in the zones themselves. */}
      <div className="relative map-canvas-frame" style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
        <div className="map-canvas-grid" />
        <Stage
          width={CANVAS_WIDTH * scale}
          height={CANVAS_HEIGHT * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Layer>
            {bgImage && (
              <KonvaImage image={bgImage} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} opacity={0.5} listening={false} />
            )}

            {objects.map((obj) => {
              // key AND ref must be literal JSX attributes on each element
              // below, not spread via this object -- both are extracted by
              // the JSX compiler statically, not read out of a merged props
              // object at runtime, so either one arriving only via {...spread}
              // silently fails to do its job (no reconciliation key, no ref
              // callback ever fires).
              const nodeRef = (node: Konva.Node | null) => {
                if (node) shapeRefs.current.set(obj.id, node);
                else shapeRefs.current.delete(obj.id);
              };
              const commonProps = {
                draggable: mode === "edit" && tool === "select",
                onClick: () => mode === "edit" && tool === "select" && setSelectedId(obj.id),
                onTap: () => mode === "edit" && tool === "select" && setSelectedId(obj.id),
                onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
                  updateGeometry(obj.id, { ...obj.geometry, x: e.target.x(), y: e.target.y() }),
                onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
                  const node = e.target;
                  updateGeometry(obj.id, {
                    ...obj.geometry,
                    x: node.x(),
                    y: node.y(),
                    width: (obj.geometry.width ?? 0) * node.scaleX(),
                    height: (obj.geometry.height ?? 0) * node.scaleY(),
                    radius: obj.geometry.radius ? obj.geometry.radius * node.scaleX() : undefined,
                    rotation: node.rotation(),
                  });
                  node.scaleX(1);
                  node.scaleY(1);
                },
              };

              const hotspot = hotspotSeverity(obj, pestEvents);
              // Alpha suffix so a zone with no hotspot reads as a faint tint
              // over the dark canvas, not a solid bright block -- that
              // solid fill was exactly what made "Zone 1"/"Zone 2" labels
              // unreadable (light text on a bright light-blue fill).
              const zoneFill = hotspot ? `${SEVERITY_COLOR[hotspot]}55` : `${MAP_BLUE_FILL}2e`;
              const zoneStroke = selectedId === obj.id ? "#ffffff" : hotspot ? SEVERITY_COLOR[hotspot] : MAP_BLUE;
              const zoneStrokeWidth = selectedId === obj.id ? 3 : hotspot ? 2.5 : 1.5;

              // A zone's name isn't visible unless it's rendered as its own
              // text -- unlike the dedicated "label" shape type, rect/circle/
              // polygon zones don't have anywhere else to show it. Rendered
              // as a plain sibling Text recomputed from the same geometry
              // each render, not attached to the shape via a Group, so
              // dragging/resizing the zone doesn't need extra transform math.
              const labelNode = (cx: number, cy: number) =>
                obj.label ? (
                  <Text
                    key={`${obj.id}-label`}
                    x={cx}
                    y={cy}
                    text={obj.label}
                    fontSize={14}
                    fill="#e7edf5"
                    align="center"
                    offsetX={obj.label.length * 3.5}
                    listening={false}
                  />
                ) : null;

              if (obj.shapeType === "rect") {
                const { x = 0, y = 0, width = 0, height = 0 } = obj.geometry;
                return [
                  <Rect
                    key={obj.id}
                    ref={nodeRef}
                    {...commonProps}
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rotation={obj.geometry.rotation ?? 0}
                    fill={zoneFill}
                    stroke={zoneStroke}
                    strokeWidth={zoneStrokeWidth}
                  />,
                  labelNode(x + width / 2, y + height / 2 - 7),
                ];
              }
              if (obj.shapeType === "circle") {
                const { x = 0, y = 0 } = obj.geometry;
                return [
                  <Circle
                    key={obj.id}
                    ref={nodeRef}
                    {...commonProps}
                    x={x}
                    y={y}
                    radius={obj.geometry.radius}
                    fill={zoneFill}
                    stroke={zoneStroke}
                    strokeWidth={zoneStrokeWidth}
                  />,
                  labelNode(x, y - 7),
                ];
              }
              if (obj.shapeType === "polygon") {
                const pts = obj.geometry.points ?? [];
                const n = pts.length / 2;
                const cx = n ? pts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / n : 0;
                const cy = n ? pts.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) / n : 0;
                return [
                  <Line
                    key={obj.id}
                    ref={nodeRef}
                    {...commonProps}
                    points={pts}
                    closed
                    fill={zoneFill}
                    stroke={zoneStroke}
                    strokeWidth={zoneStrokeWidth}
                  />,
                  labelNode(cx, cy - 7),
                ];
              }
              if (obj.shapeType === "line") {
                return (
                  <Line
                    key={obj.id}
                    ref={nodeRef}
                    {...commonProps}
                    points={obj.geometry.points}
                    stroke={MAP_BLUE}
                    strokeWidth={obj.style?.strokeWidth ?? 4}
                  />
                );
              }
              return (
                <Text
                  key={obj.id}
                  ref={nodeRef}
                  {...commonProps}
                  x={obj.geometry.x}
                  y={obj.geometry.y}
                  text={obj.label ?? ""}
                  fill="#fff"
                  fontSize={16}
                />
              );
            })}

            {drawing?.shapeType === "rect" && (
              <Rect {...drawing.geometry} fill={MAP_BLUE_FILL} stroke={MAP_BLUE} opacity={0.6} listening={false} />
            )}
            {drawing?.shapeType === "circle" && (
              <Circle
                x={drawing.geometry.x}
                y={drawing.geometry.y}
                radius={drawing.geometry.radius}
                fill={MAP_BLUE_FILL}
                stroke={MAP_BLUE}
                opacity={0.6}
                listening={false}
              />
            )}
            {tool === "polygon" && polygonPoints.length >= 2 && (
              <Line points={polygonPoints} stroke={MAP_BLUE} strokeWidth={2} listening={false} />
            )}

            {pestEvents
              .filter((ev) => ev.status === "active" && ev.x != null && ev.y != null)
              .flatMap((ev) => {
                const r = SEVERITY_RADIUS[ev.severity];
                const onActivate = () => {
                  if (mode === "view") router.push(`/app/facilities/${facilityId}/pest-events/${ev.id}`);
                  else if (tool === "select") setSelectedEvent(ev);
                };
                const nodes: React.ReactNode[] = [];
                // Halo: a soft glow behind the pin if treated in the last
                // week -- "calming down," not a hard status like the ring.
                if (wasRecentlyTreated(ev.lastTreatedAt)) {
                  nodes.push(
                    <Circle
                      key={`${ev.id}-halo`}
                      x={ev.x!}
                      y={ev.y!}
                      radius={r + 8}
                      fill={MAP_BLUE}
                      opacity={0.18}
                      listening={false}
                    />
                  );
                }
                // Ring: a thin outer stroke, only drawn if a follow-up is
                // actually due -- absence of a ring is itself information.
                if (needsFollowUp(ev.createdAt)) {
                  nodes.push(
                    <Circle
                      key={`${ev.id}-ring`}
                      x={ev.x!}
                      y={ev.y!}
                      radius={r + 5}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      dash={[3, 3]}
                      listening={false}
                    />
                  );
                }
                nodes.push(
                  <Circle
                    key={ev.id}
                    x={ev.x!}
                    y={ev.y!}
                    radius={r}
                    fill={SEVERITY_COLOR[ev.severity]}
                    stroke="#fff"
                    strokeWidth={1.5}
                    onClick={onActivate}
                    onTap={onActivate}
                  />
                );
                if (ev.trend === "up" || ev.trend === "down") {
                  nodes.push(
                    <Text
                      key={`${ev.id}-trend`}
                      x={ev.x! + r + 2}
                      y={ev.y! - r - 2}
                      text={ev.trend === "up" ? "▲" : "▼"}
                      fontSize={11}
                      fill={ev.trend === "up" ? "#e0553d" : "#7fb87a"}
                      listening={false}
                    />
                  );
                }
                return nodes;
              })}

            <Transformer ref={transformerRef} rotateEnabled />
          </Layer>
        </Stage>

        {pestFormPos && (
          <div
            className="card absolute z-10 flex w-64 flex-col gap-2 p-3"
            style={{
              left: Math.min(pestFormPos.x * scale, CANVAS_WIDTH * scale - 260),
              top: Math.min(pestFormPos.y * scale, CANVAS_HEIGHT * scale - 180),
            }}
          >
            <div className="text-sm font-medium">New pest event</div>
            <input
              autoFocus
              value={pestSpecies}
              onChange={(e) => setPestSpecies(e.target.value)}
              placeholder="Pest species (e.g. thrips)"
              className="rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm"
            />
            <select
              value={pestSeverity}
              onChange={(e) => setPestSeverity(e.target.value as Severity)}
              className="rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm"
            >
              {(["low", "moderate", "high", "severe"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={submitPestEvent}
                disabled={!pestSpecies.trim()}
                className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
              >
                Drop pin
              </button>
              <button
                onClick={() => {
                  setPestFormPos(null);
                  setTool("select");
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-dim)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {selectedEvent && (
          <div
            className="card absolute z-10 flex w-64 flex-col gap-2 p-3"
            style={{
              left: Math.min((selectedEvent.x ?? 0) * scale, CANVAS_WIDTH * scale - 260),
              top: Math.min((selectedEvent.y ?? 0) * scale, CANVAS_HEIGHT * scale - 140),
            }}
          >
            <div className="text-sm font-medium capitalize">{selectedEvent.pestSpecies}</div>
            <div className="text-xs" style={{ color: SEVERITY_COLOR[selectedEvent.severity] }}>
              {selectedEvent.severity} severity
            </div>
            {selectedEvent.notes && <div className="text-xs text-[var(--text-dim)]">{selectedEvent.notes}</div>}
            <Link href={`/app/facilities/${facilityId}/pest-events/${selectedEvent.id}`} className="text-xs text-[var(--accent)]">
              View details →
            </Link>
            <div className="flex gap-2">
              <button
                onClick={resolveSelectedEvent}
                className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]"
              >
                Mark resolved
              </button>
              <button onClick={deleteSelectedEvent} className="rounded-md border border-red-400 px-3 py-1.5 text-sm text-red-400">
                Delete
              </button>
            </div>
            <button onClick={() => setSelectedEvent(null)} className="text-xs text-[var(--text-dim)]">
              Close
            </button>
          </div>
        )}
      </div>
      {mode === "edit" && (
        <p className="text-xs text-[var(--text-dim)]">
          Select tool to move/resize existing shapes or click a pest pin. Rect/circle: click-drag. Polygon: click to
          add points, then &quot;Finish shape&quot;. Label: click to place text. Pest event: click to drop a pin.
        </p>
      )}
    </div>
  );
}
