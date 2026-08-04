"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

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

type Severity = "low" | "moderate" | "high" | "severe";

interface PestEvent {
  id: string;
  x: number | null;
  y: number | null;
  pestSpecies: string;
  severity: Severity;
  status: "active" | "resolved";
  notes: string | null;
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
const COLORS = ["#35d0a3", "#e0b84b", "#e05b5b", "#5b8fe0", "#a35be0"];
const SEVERITY_COLORS: Record<Severity, string> = {
  low: "#e0d24b",
  moderate: "#e0913d",
  high: "#e0553d",
  severe: "#a3193d",
};

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
  const [objects, setObjects] = useState<MapObject[]>(initialObjects);
  const [pestEvents, setPestEvents] = useState<PestEvent[]>(initialPestEvents);
  const [tool, setTool] = useState<ShapeType | "select" | "pest">("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]);
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
      body: JSON.stringify({ shapeType, geometry, style: { fill: color }, label }),
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
    return stage?.getPointerPosition() ?? { x: 0, y: 0 };
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
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
    <div className="flex flex-col gap-3">
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
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="h-6 w-6 rounded-full border-2"
              style={{ background: c, borderColor: color === c ? "#fff" : "transparent" }}
            />
          ))}
        </div>
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

      <div className="relative overflow-hidden rounded-lg border border-[var(--border)]">
        <Stage
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
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
                draggable: tool === "select",
                onClick: () => tool === "select" && setSelectedId(obj.id),
                onTap: () => tool === "select" && setSelectedId(obj.id),
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

              if (obj.shapeType === "rect") {
                return (
                  <Rect
                    key={obj.id}
                    ref={nodeRef}
                    {...commonProps}
                    x={obj.geometry.x}
                    y={obj.geometry.y}
                    width={obj.geometry.width}
                    height={obj.geometry.height}
                    rotation={obj.geometry.rotation ?? 0}
                    fill={obj.style?.fill ?? COLORS[0]}
                    opacity={0.7}
                    stroke={selectedId === obj.id ? "#fff" : undefined}
                  />
                );
              }
              if (obj.shapeType === "circle") {
                return (
                  <Circle
                    key={obj.id}
                    ref={nodeRef}
                    {...commonProps}
                    x={obj.geometry.x}
                    y={obj.geometry.y}
                    radius={obj.geometry.radius}
                    fill={obj.style?.fill ?? COLORS[0]}
                    opacity={0.7}
                    stroke={selectedId === obj.id ? "#fff" : undefined}
                  />
                );
              }
              if (obj.shapeType === "polygon") {
                return (
                  <Line
                    key={obj.id}
                    ref={nodeRef}
                    {...commonProps}
                    points={obj.geometry.points}
                    closed
                    fill={obj.style?.fill ?? COLORS[0]}
                    opacity={0.7}
                    stroke={selectedId === obj.id ? "#fff" : undefined}
                  />
                );
              }
              if (obj.shapeType === "line") {
                return (
                  <Line
                    key={obj.id}
                    ref={nodeRef}
                    {...commonProps}
                    points={obj.geometry.points}
                    stroke={obj.style?.fill ?? COLORS[0]}
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
              <Rect {...drawing.geometry} fill={color} opacity={0.4} listening={false} />
            )}
            {drawing?.shapeType === "circle" && (
              <Circle x={drawing.geometry.x} y={drawing.geometry.y} radius={drawing.geometry.radius} fill={color} opacity={0.4} listening={false} />
            )}
            {tool === "polygon" && polygonPoints.length >= 2 && (
              <Line points={polygonPoints} stroke={color} strokeWidth={2} listening={false} />
            )}

            {pestEvents
              .filter((ev) => ev.status === "active" && ev.x != null && ev.y != null)
              .map((ev) => (
                <Circle
                  key={ev.id}
                  x={ev.x!}
                  y={ev.y!}
                  radius={9}
                  fill={SEVERITY_COLORS[ev.severity]}
                  stroke="#fff"
                  strokeWidth={1.5}
                  onClick={() => tool === "select" && setSelectedEvent(ev)}
                  onTap={() => tool === "select" && setSelectedEvent(ev)}
                />
              ))}

            <Transformer ref={transformerRef} rotateEnabled />
          </Layer>
        </Stage>

        {pestFormPos && (
          <div
            className="card absolute z-10 flex w-64 flex-col gap-2 p-3"
            style={{ left: Math.min(pestFormPos.x, CANVAS_WIDTH - 260), top: Math.min(pestFormPos.y, CANVAS_HEIGHT - 180) }}
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
                className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0B1626] disabled:opacity-50"
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
              left: Math.min(selectedEvent.x ?? 0, CANVAS_WIDTH - 260),
              top: Math.min(selectedEvent.y ?? 0, CANVAS_HEIGHT - 140),
            }}
          >
            <div className="text-sm font-medium capitalize">{selectedEvent.pestSpecies}</div>
            <div className="text-xs" style={{ color: SEVERITY_COLORS[selectedEvent.severity] }}>
              {selectedEvent.severity} severity
            </div>
            {selectedEvent.notes && <div className="text-xs text-[var(--text-dim)]">{selectedEvent.notes}</div>}
            <Link href={`/app/facilities/${facilityId}/pest-events/${selectedEvent.id}`} className="text-xs text-[var(--accent)]">
              View details →
            </Link>
            <div className="flex gap-2">
              <button
                onClick={resolveSelectedEvent}
                className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0B1626]"
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
      <p className="text-xs text-[var(--text-dim)]">
        Select tool to move/resize existing shapes or click a pest pin. Rect/circle: click-drag. Polygon: click to
        add points, then &quot;Finish shape&quot;. Label: click to place text. Pest event: click to drop a pin.
      </p>
    </div>
  );
}
